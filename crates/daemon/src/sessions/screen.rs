//! A headless terminal that follows a PTY's output, so a viewer can be handed the screen as it
//! stands instead of a recording of how it got there.

use std::fmt::Write as _;
use std::panic::{AssertUnwindSafe, catch_unwind};

use alacritty_terminal::event::VoidListener;
use alacritty_terminal::grid::{Dimensions, Grid};
use alacritty_terminal::index::{Column, Line};
use alacritty_terminal::term::cell::{Cell, Flags};
use alacritty_terminal::term::{Config, Term, TermMode};
use alacritty_terminal::vte::ansi::{
    CharsetIndex, Color, CursorShape, NamedColor, Processor, StandardCharset,
};

/// Lines of scrollback kept above the screen, and so the most a repaint can carry. It matches what
/// a viewport keeps for itself.
const HISTORY_LINES: usize = 1000;

/// What a program writes to switch to the alternate screen (a full-screen editor or pager).
const ENTER_ALTERNATE: &str = "\u{1b}[?1049h";

/// The attributes that change how a cell looks, as opposed to how the grid is laid out.
const STYLE: Flags = Flags::INVERSE
    .union(Flags::BOLD)
    .union(Flags::ITALIC)
    .union(Flags::DIM)
    .union(Flags::HIDDEN)
    .union(Flags::STRIKEOUT)
    .union(Flags::ALL_UNDERLINES);

/// A terminal's size, as the emulator wants it.
struct Size {
    cols: usize,
    rows: usize,
}

impl Size {
    /// The emulator needs at least two columns and a row; a viewport reporting less is mid-layout.
    fn new(cols: u16, rows: u16) -> Self {
        Self {
            cols: usize::from(cols).max(2),
            rows: usize::from(rows).max(1),
        }
    }
}

impl Dimensions for Size {
    fn total_lines(&self) -> usize {
        self.rows
    }

    fn screen_lines(&self) -> usize {
        self.rows
    }

    fn columns(&self) -> usize {
        self.cols
    }
}

/// The terminal as the program on the PTY sees it: every byte of output is applied here, and
/// [`Screen::repaint`] turns the result back into output a viewer's terminal can take.
///
/// Compared with replaying the recorded bytes, the repaint is bounded (a screen and at most
/// [`HISTORY_LINES`] of history, however long the session has run), and it is right for the
/// terminal's current size: history is re-wrapped when the terminal is resized, where bytes written
/// for one width garble at another.
///
/// A repaint carries what shows and what decides how the next output and input are read: cells
/// with their colours, styles and links, the cursor, the pen, the input and mouse modes, the cursor
/// shape, the character sets, and an escape sequence the output stopped inside. It does not carry
/// state a program sets and relies on rarely: a scroll region, custom tab stops, a saved cursor, a
/// shifted-in character set, palette changes, or the window title. A program using those redraws
/// correctly from its next full repaint.
///
/// The viewer measures characters itself. Where its tables disagree with this emulator's about
/// how wide one is (an emoji newer than the viewer knows), that row comes out a column off until
/// the program redraws it.
pub struct Screen {
    term: Term<VoidListener>,
    parser: Processor,
    /// Where the output stands inside an escape sequence, if it stopped in the middle of one.
    sequence: Sequence,
    /// The primary screen as it was when the program switched to the alternate one. The emulator
    /// keeps it but does not show it, so it is captured on the way in and replayed underneath.
    primary: Option<String>,
}

impl Screen {
    pub fn new(cols: u16, rows: u16) -> Self {
        let config = Config {
            scrolling_history: HISTORY_LINES,
            ..Config::default()
        };
        Self {
            term: Term::new(config, &Size::new(cols, rows), VoidListener),
            parser: Processor::new(),
            sequence: Sequence::default(),
            primary: None,
        }
    }

    /// Applies output from the PTY.
    pub fn feed(&mut self, text: &str) {
        // The emulator is fed whatever a program prints. Should some sequence trip it up, start
        // again from a blank screen rather than take the session's reader down with it.
        if catch_unwind(AssertUnwindSafe(|| self.apply(text))).is_err() {
            *self = Self::new(self.term.columns() as u16, self.term.screen_lines() as u16);
        }
    }

    fn apply(&mut self, text: &str) {
        let mut applied = 0;
        for (at, c) in text.char_indices() {
            // The program is switching to the alternate screen: with everything before that
            // applied (the switch itself takes effect only on its last character), take down the
            // primary screen while it can still be read.
            if self.sequence.step(c) == Some(ENTER_ALTERNATE) {
                self.advance(&text[applied..at]);
                applied = at;
                if !self.alternate() {
                    let mut primary = String::new();
                    paint(self.term.grid(), &mut primary);
                    self.primary = Some(primary);
                }
            }
        }
        self.advance(&text[applied..]);
        if !self.alternate() {
            self.primary = None;
        }
    }

    fn advance(&mut self, text: &str) {
        self.parser.advance(&mut self.term, text.as_bytes());
        // A program may bracket a frame so it is drawn in one go, and the parser holds such a frame
        // back until it is complete. Viewers are sent output as it arrives, so the screen has to
        // stand where the output does: apply what has come so far.
        if self.parser.sync_bytes_count() > 0 {
            self.parser.stop_sync(&mut self.term);
        }
    }

    fn alternate(&self) -> bool {
        self.term.mode().contains(TermMode::ALT_SCREEN)
    }

    /// The terminal's size, as `(columns, rows)`.
    pub fn size(&self) -> (u16, u16) {
        (self.term.columns() as u16, self.term.screen_lines() as u16)
    }

    /// Follows the PTY to a new size, re-wrapping history to the new width. Returns whether the
    /// size changed.
    pub fn resize(&mut self, cols: u16, rows: u16) -> bool {
        let size = Size::new(cols, rows);
        if size.cols == self.term.columns() && size.rows == self.term.screen_lines() {
            return false;
        }
        if catch_unwind(AssertUnwindSafe(|| self.term.resize(size))).is_err() {
            *self = Self::new(cols, rows);
        }
        true
    }

    /// Output that draws this screen on a terminal that was just reset (`ESC c`) and is the same
    /// size: the history, the screen, where the cursor is, and the modes the program has set.
    pub fn repaint(&self) -> String {
        let mut out = String::new();
        if self.alternate() {
            if let Some(primary) = &self.primary {
                out.push_str(primary);
            }
            // The alternate screen opens with the cursor and pen wherever the primary left them;
            // painting starts from the top with a clean pen.
            out.push_str(ENTER_ALTERNATE);
            out.push_str("\u{1b}[H\u{1b}[m\u{1b}]8;;\u{1b}\\");
        }
        paint(self.term.grid(), &mut out);
        self.paint_modes(&mut out);
        // Which character sets are loaded decides what the program's next characters mean (a
        // line-drawing set turns letters into box corners).
        for (set, designate) in [
            (CharsetIndex::G0, "\u{1b}(0"),
            (CharsetIndex::G1, "\u{1b})0"),
            (CharsetIndex::G2, "\u{1b}*0"),
            (CharsetIndex::G3, "\u{1b}+0"),
        ] {
            if self.term.grid().cursor.charsets[set]
                == StandardCharset::SpecialCharacterAndLineDrawing
            {
                out.push_str(designate);
            }
        }
        // Output is cut into chunks wherever a read happened to end, which can be inside an escape
        // sequence. The viewer is sent the rest of it next, so it has to hold the start.
        out.push_str(self.sequence.pending());
        out
    }

    /// The modes a program turned on that a freshly reset terminal does not have.
    fn paint_modes(&self, out: &mut String) {
        let mode = self.term.mode();
        let set: [(TermMode, &str); 10] = [
            (TermMode::APP_CURSOR, "\u{1b}[?1h"),
            (TermMode::APP_KEYPAD, "\u{1b}="),
            (TermMode::BRACKETED_PASTE, "\u{1b}[?2004h"),
            (TermMode::MOUSE_REPORT_CLICK, "\u{1b}[?1000h"),
            (TermMode::MOUSE_DRAG, "\u{1b}[?1002h"),
            (TermMode::MOUSE_MOTION, "\u{1b}[?1003h"),
            (TermMode::UTF8_MOUSE, "\u{1b}[?1005h"),
            (TermMode::SGR_MOUSE, "\u{1b}[?1006h"),
            (TermMode::FOCUS_IN_OUT, "\u{1b}[?1004h"),
            (TermMode::INSERT, "\u{1b}[4h"),
        ];
        for (flag, sequence) in set {
            if mode.contains(flag) {
                out.push_str(sequence);
            }
        }
        if !mode.contains(TermMode::LINE_WRAP) {
            out.push_str("\u{1b}[?7l");
        }
        if !mode.contains(TermMode::SHOW_CURSOR) {
            out.push_str("\u{1b}[?25l");
        }
        // Only a cursor the program changed: the default is left to the viewer's own setting.
        let style = self.term.cursor_style();
        if style != Config::default().default_cursor_style {
            let shape = match style.shape {
                CursorShape::Block | CursorShape::HollowBlock | CursorShape::Hidden => 2,
                CursorShape::Underline => 4,
                CursorShape::Beam => 6,
            };
            let _ = write!(out, "\u{1b}[{} q", shape - u8::from(style.blinking));
        }
    }
}

/// Follows output just closely enough to know whether it stands inside an escape sequence, and to
/// hold that sequence's text so far.
#[derive(Default)]
struct Sequence {
    state: State,
    text: String,
}

#[derive(Default, Clone, Copy, PartialEq, Eq)]
enum State {
    /// Plain output.
    #[default]
    Ground,
    /// Just after `ESC`.
    Escape,
    /// In a short sequence (`ESC`, intermediates, a final character).
    Intermediate,
    /// In a control sequence (`ESC [`, parameters, a final character).
    Control,
    /// In an operating-system command, which ends at `BEL` or `ESC \`.
    Command,
    /// In a device-control or similar string, which ends at `ESC \`.
    Text,
    /// In either kind of string, just after an `ESC` that may be about to end it.
    Ending,
}

impl Sequence {
    /// Takes the next character of output. Returns the whole sequence when `c` completes one.
    fn step(&mut self, c: char) -> Option<&str> {
        const ESC: char = '\u{1b}';
        if self.state == State::Ground {
            self.text.clear();
            if c == ESC {
                self.text.push(c);
                self.state = State::Escape;
            }
            return None;
        }
        // Cancel and substitute abandon whatever sequence is under way.
        if matches!(c, '\u{18}' | '\u{1a}') {
            self.state = State::Ground;
            self.text.clear();
            return None;
        }
        let string = matches!(self.state, State::Command | State::Text | State::Ending);
        if c == ESC && !string {
            // A new sequence starts; the unfinished one is dropped.
            self.text.clear();
            self.text.push(c);
            self.state = State::Escape;
            return None;
        }
        if self.state == State::Ending && c != '\\' {
            // The `ESC` did not end the string but cut it short to start something else.
            self.text.clear();
            self.text.push(ESC);
            self.state = State::Escape;
        }
        // Outside a string, a control character acts at once and is not part of the sequence; it
        // has had its effect, so it is not held to be sent again.
        if c.is_control() && !matches!(self.state, State::Command | State::Text | State::Ending) {
            return None;
        }
        self.text.push(c);
        self.state = match (self.state, c) {
            (State::Escape, '[') => State::Control,
            (State::Escape, ']') => State::Command,
            (State::Escape, 'P' | 'X' | '^' | '_') => State::Text,
            (State::Escape | State::Intermediate, ' '..='/') => State::Intermediate,
            (State::Escape | State::Intermediate, _) => State::Ground,
            (State::Control, '@'..='~') => State::Ground,
            (State::Control, _) => State::Control,
            (State::Command, '\u{7}') => State::Ground,
            (State::Command | State::Text, ESC) => State::Ending,
            (State::Command, _) => State::Command,
            (State::Text, _) => State::Text,
            (State::Ending, _) => State::Ground,
            (State::Ground, _) => State::Ground,
        };
        (self.state == State::Ground).then_some(self.text.as_str())
    }

    /// The text of the sequence the output stopped inside, or nothing between sequences.
    fn pending(&self) -> &str {
        if self.state == State::Ground {
            ""
        } else {
            &self.text
        }
    }
}

/// How the cells being written look. A change is written out only when the next cell differs.
#[derive(Clone, PartialEq, Eq)]
struct Pen {
    fg: Color,
    bg: Color,
    style: Flags,
    underline: Option<Color>,
    /// The link the cells belong to, as `(id, uri)`.
    link: Option<(String, String)>,
}

impl Default for Pen {
    fn default() -> Self {
        Self {
            fg: Color::Named(NamedColor::Foreground),
            bg: Color::Named(NamedColor::Background),
            style: Flags::empty(),
            underline: None,
            link: None,
        }
    }
}

impl Pen {
    fn of(cell: &Cell) -> Self {
        Self {
            fg: cell.fg,
            bg: cell.bg,
            style: cell.flags & STYLE,
            underline: cell.underline_color(),
            link: cell
                .hyperlink()
                .map(|link| (link.id().to_string(), link.uri().to_string())),
        }
    }

    /// Switches to `next`, writing whatever sequences that takes.
    fn switch(&mut self, next: Pen, out: &mut String) {
        if *self == next {
            return;
        }
        if self.link != next.link {
            match &next.link {
                Some((id, uri)) => {
                    let _ = write!(out, "\u{1b}]8;id={id};{uri}\u{1b}\\");
                }
                None => out.push_str("\u{1b}]8;;\u{1b}\\"),
            }
        }
        let looks = |pen: &Pen| (pen.fg, pen.bg, pen.style, pen.underline);
        if looks(self) != looks(&next) {
            // Always from a clean slate: one sequence, and nothing carried over by mistake.
            out.push_str("\u{1b}[0");
            for (flag, code) in [
                (Flags::BOLD, "1"),
                (Flags::DIM, "2"),
                (Flags::ITALIC, "3"),
                (Flags::UNDERLINE, "4"),
                (Flags::DOUBLE_UNDERLINE, "4:2"),
                (Flags::UNDERCURL, "4:3"),
                (Flags::DOTTED_UNDERLINE, "4:4"),
                (Flags::DASHED_UNDERLINE, "4:5"),
                (Flags::INVERSE, "7"),
                (Flags::HIDDEN, "8"),
                (Flags::STRIKEOUT, "9"),
            ] {
                if next.style.contains(flag) {
                    out.push(';');
                    out.push_str(code);
                }
            }
            color(out, next.fg, 30);
            color(out, next.bg, 40);
            if let Some(underline) = next.underline {
                match underline {
                    Color::Indexed(index) => {
                        let _ = write!(out, ";58;5;{index}");
                    }
                    Color::Spec(rgb) => {
                        let _ = write!(out, ";58;2;{};{};{}", rgb.r, rgb.g, rgb.b);
                    }
                    Color::Named(_) => {}
                }
            }
            out.push('m');
        }
        *self = next;
    }
}

/// Writes the SGR parameters for a colour. `base` is 30 for text and 40 for the background; the
/// terminal's own default colours need none, since the pen was just reset.
fn color(out: &mut String, color: Color, base: u8) {
    match color {
        Color::Named(named) => match named as u16 {
            index @ 0..=7 => {
                let _ = write!(out, ";{}", u16::from(base) + index);
            }
            index @ 8..=15 => {
                let _ = write!(out, ";{}", u16::from(base) + 60 + index - 8);
            }
            _ => {}
        },
        Color::Indexed(index) => {
            let _ = write!(out, ";{};5;{index}", base + 8);
        }
        Color::Spec(rgb) => {
            let _ = write!(out, ";{};2;{};{};{}", base + 8, rgb.r, rgb.g, rgb.b);
        }
    }
}

/// How many of a row's cells have to be written: all of them up to the last that shows anything.
fn shown(grid: &Grid<Cell>, line: Line) -> usize {
    let row = &grid[line];
    (0..grid.columns())
        .rev()
        .find(|col| !is_blank(&row[Column(*col)]))
        .map_or(0, |col| col + 1)
}

/// Whether a cell looks the same as one never written to.
fn is_blank(cell: &Cell) -> bool {
    (cell.c == ' ' || cell.c == '\t')
        && Pen::of(cell) == Pen::default()
        && cell.zerowidth().is_none_or(<[char]>::is_empty)
        && !cell
            .flags
            .intersects(Flags::WIDE_CHAR_SPACER | Flags::LEADING_WIDE_CHAR_SPACER)
}

/// Writes one cell's text, unless it is only the far half of a wide character.
fn put(cell: &Cell, pen: &mut Pen, out: &mut String) {
    if cell
        .flags
        .intersects(Flags::WIDE_CHAR_SPACER | Flags::LEADING_WIDE_CHAR_SPACER)
    {
        return;
    }
    pen.switch(Pen::of(cell), out);
    // A tab is kept in the cell it started from, for copying; on screen it is the blanks after it.
    out.push(if cell.c == '\t' { ' ' } else { cell.c });
    if let Some(marks) = cell.zerowidth() {
        out.extend(marks);
    }
}

/// Writes a grid — its history, then its screen — as lines of text, top to bottom, and leaves the
/// cursor and the pen where the program has them. On a terminal of the same size, starting from the
/// top of an empty screen, the history scrolls off into the viewer's scrollback and the screen lands
/// where it was.
fn paint(grid: &Grid<Cell>, out: &mut String) {
    let cols = grid.columns();
    let top = -(grid.history_size() as i32);
    let bottom = grid.screen_lines() as i32 - 1;
    let mut pen = Pen::default();

    for index in top..=bottom {
        let line = Line(index);
        let row = &grid[line];
        // A row that ran on into the next is written to its last column and left there: the next
        // row's first character wraps on the viewer's side too, which keeps the two rows one line
        // (so the viewer can re-wrap it).
        let wrapped = row[Column(cols - 1)].flags.contains(Flags::WRAPLINE) && index < bottom;
        let width = if wrapped { cols } else { shown(grid, line) };
        for col in 0..width {
            put(&row[Column(col)], &mut pen, out);
        }
        if wrapped {
            if shown(grid, Line(index + 1)) == 0 {
                // Nothing on the next row will do the wrapping, so a blank does, and the cursor
                // goes back to the start of that row.
                pen.switch(Pen::default(), out);
                out.push_str(" \r");
            }
        } else if index < bottom {
            // A new line is filled with the background in use, so move down in the default one.
            if pen.bg != Pen::default().bg || pen.style.contains(Flags::INVERSE) {
                pen.switch(
                    Pen {
                        link: pen.link.clone(),
                        ..Pen::default()
                    },
                    out,
                );
            }
            out.push_str("\r\n");
        }
    }

    let cursor = &grid.cursor;
    let (row, col) = (cursor.point.line.0.max(0) as usize, cursor.point.column.0);
    if cursor.input_needs_wrap {
        // The cursor sits past the last column, waiting to wrap. Only writing that column puts a
        // terminal in this state, so write it again: its wide character whole, if it holds one.
        let cells = &grid[cursor.point.line];
        let last = cols - 1;
        let from = if cells[Column(last)].flags.contains(Flags::WIDE_CHAR_SPACER) {
            last.saturating_sub(1)
        } else {
            last
        };
        let _ = write!(out, "\u{1b}[{};{}H", row + 1, from + 1);
        put(&cells[Column(from)], &mut pen, out);
    } else {
        let _ = write!(out, "\u{1b}[{};{}H", row + 1, col + 1);
    }
    // What the program writes next continues in the look it last chose.
    pen.switch(Pen::of(&cursor.template), out);
}

#[cfg(test)]
mod tests {
    use super::*;

    const COLS: u16 = 20;
    const ROWS: u16 = 6;

    /// A terminal of the same size that was reset and then sent `screen`'s repaint, as a viewer's is.
    fn viewer_of(screen: &Screen) -> Screen {
        let mut viewer = Screen::new(
            screen.term.columns() as u16,
            screen.term.screen_lines() as u16,
        );
        viewer.feed(&format!("\u{1b}c{}", screen.repaint()));
        viewer
    }

    /// One cell reduced to what a viewer can see of it.
    fn look(cell: &Cell) -> (char, Pen, Vec<char>, bool, bool) {
        (
            if cell.c == '\t' { ' ' } else { cell.c },
            Pen::of(cell),
            cell.zerowidth().unwrap_or_default().to_vec(),
            cell.flags.contains(Flags::WRAPLINE),
            cell.flags.contains(Flags::WIDE_CHAR),
        )
    }

    /// Every row of a grid, history first, each as the text it shows.
    fn rows(grid: &Grid<Cell>) -> Vec<String> {
        (-(grid.history_size() as i32)..grid.screen_lines() as i32)
            .map(|line| {
                (0..grid.columns())
                    .map(|col| grid[Line(line)][Column(col)].c)
                    .collect::<String>()
                    .trim_end()
                    .to_string()
            })
            .collect()
    }

    /// Asserts a viewer sent the repaint ends up with what the screen has: every cell of the
    /// history and the screen, the cursor, the pen, and the modes.
    #[track_caller]
    fn assert_same(screen: &Screen, viewer: &Screen) {
        let (a, b) = (screen.term.grid(), viewer.term.grid());
        assert_eq!(rows(a), rows(b), "text differs");
        assert_eq!(a.history_size(), b.history_size(), "history length differs");
        for line in -(a.history_size() as i32)..a.screen_lines() as i32 {
            for col in 0..a.columns() {
                let (left, right) = (&a[Line(line)][Column(col)], &b[Line(line)][Column(col)]);
                assert!(
                    look(left) == look(right),
                    "cell at line {line}, column {col} differs: {left:?} vs {right:?}"
                );
            }
        }
        assert_eq!(a.cursor.point, b.cursor.point, "cursor differs");
        assert_eq!(
            a.cursor.input_needs_wrap, b.cursor.input_needs_wrap,
            "pending wrap differs"
        );
        assert_eq!(
            a.cursor.charsets, b.cursor.charsets,
            "character sets differ"
        );
        assert!(
            Pen::of(&a.cursor.template) == Pen::of(&b.cursor.template),
            "pen differs"
        );
        // Alternate scroll is the emulator's own default and is left to the viewer.
        let modes = |screen: &Screen| *screen.term.mode() - TermMode::ALTERNATE_SCROLL;
        assert_eq!(modes(screen), modes(viewer), "modes differ");
        assert_eq!(screen.term.cursor_style(), viewer.term.cursor_style());
    }

    /// Feeds `output` to a screen and checks a viewer of it matches, then returns both.
    #[track_caller]
    fn check(output: &str) -> (Screen, Screen) {
        let mut screen = Screen::new(COLS, ROWS);
        screen.feed(output);
        let viewer = viewer_of(&screen);
        assert_same(&screen, &viewer);
        (screen, viewer)
    }

    #[test]
    fn a_viewer_gets_the_screen_and_the_history_above_it() {
        let output: String = (1..=20).map(|n| format!("line {n}\r\n")).collect();
        let (screen, _) = check(&output);
        let rows = rows(screen.term.grid());
        assert_eq!(rows.first().map(String::as_str), Some("line 1"));
        assert_eq!(rows[19], "line 20");
        assert_eq!(screen.term.grid().history_size(), 15);
    }

    #[test]
    fn a_short_screen_keeps_its_blank_lines_and_cursor() {
        check("one\r\ntwo");
        check("");
        check("\u{1b}[3;5Hmid");
    }

    #[test]
    fn colours_and_styles_survive() {
        check(concat!(
            "\u{1b}[1mbold\u{1b}[0m \u{1b}[2mdim\u{1b}[0m \u{1b}[3mit\u{1b}[0m\r\n",
            "\u{1b}[4mu\u{1b}[0m\u{1b}[4:3mcurl\u{1b}[0m\u{1b}[21mdbl\u{1b}[0m\u{1b}[9mx\u{1b}[0m\r\n",
            "\u{1b}[31mred\u{1b}[92mbright\u{1b}[38;5;208morange\u{1b}[0m\r\n",
            "\u{1b}[38;2;1;2;3mrgb\u{1b}[48;2;9;8;7mon\u{1b}[0m \u{1b}[7minv\u{1b}[0m\r\n",
            "\u{1b}[4;58;2;255;0;0mcolored underline\u{1b}[0m",
        ));
    }

    #[test]
    fn a_coloured_background_does_not_spill_onto_new_lines() {
        // The row ends in the highlighted cell, and blank rows follow.
        check("\u{1b}[44mblue\u{1b}[0m\r\n\r\nafter");
        check("\u{1b}[7m sel \u{1b}[0m\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\nscrolled");
    }

    #[test]
    fn the_pen_in_use_carries_on() {
        // The program left a colour on; what it writes next must come out in it.
        let (mut screen, mut viewer) = check("plain \u{1b}[1;35m");
        screen.feed("next");
        viewer.feed("next");
        assert_same(&screen, &viewer);
    }

    #[test]
    fn wide_and_combining_characters_survive() {
        check("a\u{4e2d}\u{6587}b e\u{301}x \u{1f600}!");
        // A wide character that does not fit at the end of a row moves to the next.
        check(&format!(
            "{}\u{4e2d}tail",
            "x".repeat(usize::from(COLS) - 1)
        ));
    }

    #[test]
    fn a_long_line_stays_one_line() {
        let (screen, viewer) = check(&format!("{}\r\nshort", "w".repeat(45)));
        // Wrapped rows are marked as such on the viewer too, so it can re-wrap them itself.
        let wrapped = |screen: &Screen| {
            screen.term.grid()[Line(0)][Column(usize::from(COLS) - 1)]
                .flags
                .contains(Flags::WRAPLINE)
        };
        assert!(wrapped(&screen) && wrapped(&viewer));
    }

    #[test]
    fn a_line_that_ran_on_into_a_blank_row_is_still_one_line() {
        // The row filled up and the line went on with only blanks so far.
        let (screen, viewer) = check(&format!("{}  ", "w".repeat(usize::from(COLS))));
        let wrapped = |screen: &Screen| {
            screen.term.grid()[Line(0)][Column(usize::from(COLS) - 1)]
                .flags
                .contains(Flags::WRAPLINE)
        };
        assert!(wrapped(&screen) && wrapped(&viewer));
        // The same, with more lines after it and with the run-on row itself full of blanks.
        check(&format!(
            "{}  \r\nnext\r\nlast",
            "w".repeat(usize::from(COLS))
        ));
        check(&format!(
            "{}{} tail",
            "w".repeat(usize::from(COLS)),
            " ".repeat(usize::from(COLS))
        ));
    }

    #[test]
    fn a_full_row_with_the_cursor_waiting_to_wrap_survives() {
        let (mut screen, mut viewer) = check(&"z".repeat(usize::from(COLS)));
        assert!(screen.term.grid().cursor.input_needs_wrap);
        // The next character wraps on both, instead of overwriting the last column on the viewer.
        screen.feed("!");
        viewer.feed("!");
        assert_same(&screen, &viewer);

        check(&format!("{}\u{4e2d}", "z".repeat(usize::from(COLS) - 2)));
    }

    #[test]
    fn a_redrawn_frame_is_sent_as_it_ended_up() {
        // The way a full-screen program paints: move, erase, overwrite, over and over.
        let mut output = String::from("header\r\n");
        for frame in 0..50 {
            let _ = write!(
                output,
                "\u{1b}[2;1H\u{1b}[2Kframe {frame}\r\n\u{1b}[2K\u{1b}[2mworking\u{1b}[0m"
            );
        }
        let (screen, _) = check(&output);
        assert_eq!(
            rows(screen.term.grid())[..3],
            ["header", "frame 49", "working"]
        );
        // Fifty frames went in; one screen comes out.
        assert!(screen.repaint().len() < 200, "{}", screen.repaint().len());
    }

    #[test]
    fn modes_the_program_set_are_set_on_the_viewer() {
        check("\u{1b}[?2004h\u{1b}[?1h\u{1b}=\u{1b}[?1000h\u{1b}[?1006h\u{1b}[?1004h\u{1b}[?25lx");
        check("\u{1b}[?1002h\u{1b}[?1003h\u{1b}[4h\u{1b}[?7ly");
        check("\u{1b}[5 qbar");
        check("\u{1b}[4 qunderline");
    }

    #[test]
    fn links_survive() {
        check("see \u{1b}]8;id=a;https://example.com\u{1b}\\the docs\u{1b}]8;;\u{1b}\\ now");
    }

    #[test]
    fn a_repaint_is_bounded_however_much_was_written() {
        let mut screen = Screen::new(COLS, ROWS);
        for n in 0..5000 {
            screen.feed(&format!("line {n}\r\n"));
        }
        let viewer = viewer_of(&screen);
        assert_same(&screen, &viewer);
        assert_eq!(viewer.term.grid().history_size(), HISTORY_LINES);
        assert_eq!(rows(viewer.term.grid())[0], "line 3995");
        assert!(screen.repaint().len() < 16 * 1024);
    }

    #[test]
    fn history_is_rewrapped_when_the_terminal_is_resized() {
        let mut screen = Screen::new(40, ROWS);
        let sentence = "the quick brown fox jumps over the dog";
        for _ in 0..10 {
            screen.feed(&format!("{sentence}\r\n"));
        }
        // Narrower (a phone takes control), then back: nothing is cut off or left mis-wrapped.
        screen.resize(15, ROWS);
        assert_same(&screen, &viewer_of(&screen));
        screen.resize(40, ROWS);
        assert_same(&screen, &viewer_of(&screen));
        let rows = rows(screen.term.grid());
        assert_eq!(rows.iter().filter(|row| *row == sentence).count(), 10);
    }

    #[test]
    fn a_full_screen_program_is_shown_over_the_screen_it_covered() {
        let mut screen = Screen::new(COLS, ROWS);
        for n in 0..10 {
            screen.feed(&format!("before {n}\r\n"));
        }
        screen.feed("$ edit");
        screen.feed("\u{1b}[?1049h\u{1b}[2J\u{1b}[Hfile contents\r\n~\r\n~");

        let mut viewer = viewer_of(&screen);
        assert_same(&screen, &viewer);
        assert!(viewer.alternate());

        // Leaving the program shows the screen from before, on the viewer as on the daemon.
        for side in [&mut screen, &mut viewer] {
            side.feed("\u{1b}[?1049l");
        }
        assert_same(&screen, &viewer);
        let rows = rows(viewer.term.grid());
        assert_eq!(rows.last().map(String::as_str), Some("$ edit"));
        assert!(rows.contains(&"before 0".to_string()));
    }

    #[test]
    fn a_frame_still_being_drawn_is_included() {
        // A program brackets a frame so it shows at once; a viewer arriving in the middle is sent
        // the rest as it comes, so the repaint has to include the part already written.
        let mut screen = Screen::new(COLS, ROWS);
        screen.feed("\u{1b}[?2026hfirst half ");
        let mut viewer = viewer_of(&screen);
        assert_eq!(rows(viewer.term.grid())[0], "first half");

        for side in [&mut screen, &mut viewer] {
            side.feed("second\u{1b}[?2026l");
        }
        assert_same(&screen, &viewer);
        assert_eq!(rows(viewer.term.grid())[0], "first half second");
    }

    #[test]
    fn a_viewer_can_arrive_at_any_point_in_the_output() {
        // Output reaches viewers in chunks cut wherever a read ended, so a viewer may arrive with
        // the output in the middle of anything: a colour change, a link, a title, a switch to a
        // full-screen program. Wherever that is, the repaint plus what follows must come to the same.
        let output = concat!(
            "plain \u{1b}[1;38;5;208mbold orange\u{1b}[0m\r\n",
            "\u{1b}]0;a window title\u{7}",
            "\u{1b}]8;id=x;https://example.com\u{1b}\\link\u{1b}]8;;\u{1b}\\\r\n",
            "\u{1b}(0lqk\u{1b}(B box\r\n",
            "\u{1b}P1$r0m\u{1b}\\after a device string\r\n",
            "wide \u{4e2d}\u{6587} e\u{301}\r\n",
            "\u{1b}[?2026h\u{1b}[1;1H\u{1b}[2Kredrawn\u{1b}[?2026l\u{1b}[6;1H",
            "\u{1b}[?1049h\u{1b}[2J\u{1b}[Hfull screen\u{1b}[3;3Hprogram",
            "\u{1b}[?1049l back \u{1b}[7minverse\u{1b}[27m end",
        );
        let mut whole = Screen::new(COLS, ROWS);
        whole.feed(output);

        for (at, _) in output.char_indices() {
            let mut screen = Screen::new(COLS, ROWS);
            screen.feed(&output[..at]);
            let mut viewer = viewer_of(&screen);
            viewer.feed(&output[at..]);
            // Fed in two pieces, the daemon's own screen comes to the same as fed in one.
            screen.feed(&output[at..]);
            assert_eq!(rows(whole.term.grid()), rows(screen.term.grid()), "at {at}");
            assert_eq!(
                rows(whole.term.grid()),
                rows(viewer.term.grid()),
                "viewer arriving at {at}: {:?}",
                &output[..at]
            );
            assert_same(&screen, &viewer);
        }
    }

    #[test]
    fn a_viewer_arriving_inside_a_full_screen_program_sees_what_it_covered_afterwards() {
        // The switch to the alternate screen arrives split across two reads.
        let mut screen = Screen::new(COLS, ROWS);
        screen.feed("$ prompt\u{1b}[?10");
        screen.feed("49h\u{1b}[Hediting");
        let mut viewer = viewer_of(&screen);
        for side in [&mut screen, &mut viewer] {
            side.feed("\u{1b}[?1049l");
        }
        assert_same(&screen, &viewer);
        assert_eq!(rows(viewer.term.grid())[0], "$ prompt");
    }

    #[test]
    fn the_sequence_under_way_is_tracked() {
        let pending = |output: &str| {
            let mut sequence = Sequence::default();
            for c in output.chars() {
                sequence.step(c);
            }
            sequence.pending().to_string()
        };
        assert_eq!(pending("text"), "");
        assert_eq!(pending("text\u{1b}"), "\u{1b}");
        assert_eq!(pending("\u{1b}[38;5"), "\u{1b}[38;5");
        assert_eq!(pending("\u{1b}[38;5;1m"), "");
        assert_eq!(pending("\u{1b}]0;tit"), "\u{1b}]0;tit");
        assert_eq!(pending("\u{1b}]0;title\u{7}"), "");
        assert_eq!(pending("\u{1b}]8;;uri\u{1b}"), "\u{1b}]8;;uri\u{1b}");
        assert_eq!(pending("\u{1b}]8;;uri\u{1b}\\"), "");
        assert_eq!(pending("\u{1b}("), "\u{1b}(");
        assert_eq!(pending("\u{1b}(0"), "");
        // A new escape drops the unfinished sequence; cancel drops it outright.
        assert_eq!(pending("\u{1b}[1;\u{1b}[2"), "\u{1b}[2");
        assert_eq!(pending("\u{1b}[1;\u{18}"), "");
        // A line feed inside a control sequence acts at once and is not sent again.
        assert_eq!(pending("\u{1b}[1\n;2"), "\u{1b}[1;2");

        let mut sequence = Sequence::default();
        let done: Vec<String> = "a\u{1b}[?1049hb\u{1b}[m"
            .chars()
            .filter_map(|c| sequence.step(c).map(str::to_string))
            .collect();
        assert_eq!(done, [ENTER_ALTERNATE, "\u{1b}[m"]);
    }

    #[test]
    fn a_degenerate_size_is_clamped() {
        let mut screen = Screen::new(0, 0);
        screen.feed("ok");
        screen.resize(0, 0);
        screen.resize(1, 1);
        screen.feed("still ok\r\n");
        let _ = screen.repaint();
    }
}
