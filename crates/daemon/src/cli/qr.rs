use qrcode::QrCode;
use qrcode::render::unicode::Dense1x2;

/// A QR code drawn in text, two modules to a character. Terminals draw light text on a dark
/// background, so the code is drawn in reverse: the light modules are the characters printed.
pub fn render(text: &str) -> anyhow::Result<String> {
    let code = QrCode::new(text.as_bytes())?;

    Ok(code
        .render::<Dense1x2>()
        .dark_color(Dense1x2::Light)
        .light_color(Dense1x2::Dark)
        .quiet_zone(true)
        .build())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pairing_code_fits_an_ordinary_terminal() {
        // About as long as a real pairing code: a relay URL, a room, a device id and a key.
        let code = format!("soromi://pair#{}", "A".repeat(300));
        let drawn = render(&code).unwrap();
        let widest = drawn
            .lines()
            .map(|line| line.chars().count())
            .max()
            .unwrap();

        assert!(widest <= 80, "{widest} columns");
    }
}
