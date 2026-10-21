//! The agents a session's agent has running beside it: the list behind "N agents working in the
//! background".
//!
//! An agent is started by a tool call. Most run within that call and are done when it returns.
//! One sent to the background outlives the call, and often the whole turn: the main agent says it
//! is waiting and goes idle while the other works on. Such an agent stays listed until its
//! provider says it stopped (see `Provider::task_signals`), however many turns pass. It can also be
//! set going again later, by a message, and is then listed again under the name it had.

use std::collections::HashMap;

use soromi_protocol::{ChatEvent, Status, SubAgent, ToolKind};

use super::session::now_secs;
use crate::providers::TaskSignal;

/// What an agent is called when nothing has said what it is doing.
const UNNAMED: &str = "Background agent";

#[derive(Debug, Default)]
pub(crate) struct Subagents {
    running: Vec<Running>,
    /// What each background agent was called, by its task id, so one that is set going again
    /// after it stopped is listed under the same name.
    names: HashMap<String, String>,
}

#[derive(Debug)]
struct Running {
    /// The tool call that started it, when the session saw it.
    tool: Option<String>,
    /// The id its provider gave it, once known.
    task: Option<String>,
    /// Whether it carries on after its tool call returns.
    background: bool,
    agent: SubAgent,
}

impl Subagents {
    /// The agents at work, in the order they started.
    pub fn list(&self) -> Vec<SubAgent> {
        self.running.iter().map(|one| one.agent.clone()).collect()
    }

    /// Takes in what one line of the provider's output said: its signals about background agents
    /// first (so a launch is known to be a background one before its tool call is seen to
    /// return), then its chat events. Returns whether the list changed.
    pub fn apply(&mut self, signals: &[TaskSignal], events: &[ChatEvent]) -> bool {
        let mut changed = false;
        for signal in signals {
            changed |= match signal {
                TaskSignal::Running {
                    task,
                    tool,
                    name,
                    background,
                } => self.heard(task, tool.as_deref(), name.as_deref(), *background),
                TaskSignal::Ended { task, tool, name } => {
                    self.ended(task, tool.as_deref(), name.as_deref())
                }
            };
        }
        for event in events {
            changed |= match event {
                // A new prompt from the user: what ran within the last turn is over.
                ChatEvent::User { .. } => self.settle(),
                ChatEvent::Tool {
                    id,
                    body,
                    tool_kind: ToolKind::Agent,
                    ..
                } => self.started(id, body.as_deref()),
                // The call returned. An agent that ran within it is done; one in the background
                // only had its launch acknowledged, and works on.
                ChatEvent::ToolResult { id, .. } => {
                    let before = self.running.len();
                    self.running
                        .retain(|one| one.background || one.tool.as_deref() != Some(id));
                    self.running.len() != before
                }
                _ => false,
            };
        }
        changed
    }

    /// The turn is over, or a new one begins: agents that run within a turn are done with it.
    /// Background ones are not: they are why the main agent can stop and wait. Returns whether
    /// the list changed.
    pub fn settle(&mut self) -> bool {
        let before = self.running.len();
        self.running.retain(|one| one.background);
        self.running.len() != before
    }

    /// The conversation started over: nothing from the old one is running in the new.
    pub fn clear(&mut self) {
        self.running.clear();
        self.names.clear();
    }

    /// A tool call started an agent.
    fn started(&mut self, tool: &str, name: Option<&str>) -> bool {
        // The provider may already have said so itself, naming the same call.
        if self
            .running
            .iter()
            .any(|one| one.tool.as_deref() == Some(tool))
        {
            return false;
        }
        self.running.push(Running {
            tool: Some(tool.to_string()),
            task: None,
            background: false,
            agent: agent(Some(tool), name.unwrap_or("sub-agent")),
        });
        true
    }

    /// The provider says an agent is at work.
    fn heard(
        &mut self,
        task: &str,
        tool: Option<&str>,
        name: Option<&str>,
        background: Option<bool>,
    ) -> bool {
        // It is one already listed: by its id, or else as the agent the same tool call started.
        let known = self
            .running
            .iter()
            .position(|one| one.task.as_deref() == Some(task))
            .or_else(|| {
                let tool = tool?;
                self.running
                    .iter()
                    .position(|one| one.task.is_none() && one.tool.as_deref() == Some(tool))
            });
        if let Some(index) = known {
            let one = &mut self.running[index];
            one.task = Some(task.to_string());
            one.background |= background == Some(true);
            if one.background {
                self.names
                    .entry(task.to_string())
                    .or_insert_with(|| one.agent.name.clone());
            }
            // Nothing a viewer sees changed: the list holds names, and this one keeps its own.
            return false;
        }

        // It is new here: started before this session was listening, or set going again after it
        // had stopped. It is called what it was called before, if it was ever heard of.
        let name = self
            .names
            .get(task)
            .cloned()
            .or_else(|| name.map(str::to_string));
        let background = background.unwrap_or(true);
        if background {
            self.names
                .entry(task.to_string())
                .or_insert_with(|| name.clone().unwrap_or_else(|| UNNAMED.to_string()));
        }
        self.running.push(Running {
            tool: tool.map(str::to_string),
            task: Some(task.to_string()),
            background,
            // Known by the call that started it when that is known, as the session would have
            // listed it; otherwise by its own id.
            agent: agent(tool.or(Some(task)), name.as_deref().unwrap_or(UNNAMED)),
        });
        true
    }

    /// The provider says an agent stopped.
    fn ended(&mut self, task: &str, tool: Option<&str>, name: Option<&str>) -> bool {
        if let Some(name) = name {
            self.names
                .entry(task.to_string())
                .or_insert_with(|| name.to_string());
        }
        let before = self.running.len();
        self.running.retain(|one| {
            let same_task = one.task.as_deref() == Some(task);
            // One whose id was never learned is known only by the call that started it.
            let same_call = one.task.is_none() && tool.is_some() && one.tool.as_deref() == tool;
            !(same_task || same_call)
        });
        self.running.len() != before
    }
}

fn agent(id: Option<&str>, name: &str) -> SubAgent {
    SubAgent {
        id: id.map(str::to_string),
        name: name.to_string(),
        status: Status::Thinking,
        started_at: Some(now_secs()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn launch(id: &str, name: &str) -> ChatEvent {
        ChatEvent::Tool {
            id: id.into(),
            name: "Agent".into(),
            path: None,
            body: Some(name.into()),
            tool_kind: ToolKind::Agent,
        }
    }

    fn result(id: &str) -> ChatEvent {
        ChatEvent::ToolResult {
            id: id.into(),
            ok: true,
            text: "…".into(),
            files: Vec::new(),
        }
    }

    fn prompt() -> ChatEvent {
        ChatEvent::User {
            text: "now the next thing".into(),
            files: Vec::new(),
        }
    }

    fn running(
        task: &str,
        tool: Option<&str>,
        name: Option<&str>,
        background: Option<bool>,
    ) -> TaskSignal {
        TaskSignal::Running {
            task: task.into(),
            tool: tool.map(str::to_string),
            name: name.map(str::to_string),
            background,
        }
    }

    fn ended(task: &str) -> TaskSignal {
        TaskSignal::Ended {
            task: task.into(),
            tool: None,
            name: None,
        }
    }

    fn names(agents: &Subagents) -> Vec<String> {
        agents.list().into_iter().map(|agent| agent.name).collect()
    }

    #[test]
    fn an_agent_that_runs_within_its_call_is_listed_until_the_call_returns() {
        let mut agents = Subagents::default();

        assert!(agents.apply(
            &[],
            &[
                launch("t1", "Map v1 to v2"),
                launch("t2", "Rewrite encoder")
            ]
        ));
        assert_eq!(names(&agents), ["Map v1 to v2", "Rewrite encoder"]);

        // Another kind of tool is not an agent.
        let shell = ChatEvent::Tool {
            id: "b1".into(),
            name: "Bash".into(),
            path: None,
            body: Some("ls".into()),
            tool_kind: ToolKind::Run,
        };
        assert!(!agents.apply(&[], &[shell]));

        assert!(agents.apply(&[], &[result("t1")]));
        assert_eq!(names(&agents), ["Rewrite encoder"]);

        // A new prompt ends whatever was still running within the last turn.
        assert!(agents.apply(&[], &[prompt()]));
        assert!(agents.list().is_empty());
    }

    #[test]
    fn a_background_agent_outlives_its_call_its_turn_and_the_next_prompt() {
        let mut agents = Subagents::default();
        agents.apply(&[], &[launch("t1", "Map the popup")]);

        // Its call returns at once, with only the news that it was launched: one line carries
        // both, and the signal is what says it is a background one.
        let ack = running("a1", Some("t1"), None, Some(true));
        assert!(!agents.apply(&[ack], &[result("t1")]));
        assert_eq!(names(&agents), ["Map the popup"]);

        // The main agent says it is waiting and the turn ends. The other is still at work.
        assert!(!agents.settle());
        assert!(!agents.apply(&[], &[prompt()]));
        assert_eq!(names(&agents), ["Map the popup"]);

        // Until its provider says it stopped.
        assert!(agents.apply(&[ended("a1")], &[]));
        assert!(agents.list().is_empty());
        // Hearing that again changes nothing.
        assert!(!agents.apply(&[ended("a1")], &[]));
    }

    #[test]
    fn an_agent_set_going_again_is_listed_under_the_name_it_had() {
        let mut agents = Subagents::default();

        // It was started by an earlier process, which is gone. All this session hears is that it
        // did not finish, and what it was called.
        let orphaned = TaskSignal::Ended {
            task: "a1".into(),
            tool: None,
            name: Some("Map the popup".into()),
        };
        assert!(!agents.apply(&[orphaned], &[]));

        // The main agent sends it a message to carry on.
        let resume = running("a1", Some("m1"), Some("Resume the mapping"), Some(true));
        assert!(agents.apply(std::slice::from_ref(&resume), &[]));
        assert_eq!(names(&agents), ["Map the popup"]);
        // The message's own call returning does not end it, and neither does the turn.
        assert!(!agents.apply(&[], &[result("m1")]));
        assert!(!agents.settle());
        // Hearing of it again does not list it twice.
        assert!(!agents.apply(&[resume], &[]));
        assert_eq!(agents.list().len(), 1);

        assert!(agents.apply(&[ended("a1")], &[]));
        assert!(agents.list().is_empty());
    }

    #[test]
    fn what_the_provider_says_and_the_tool_call_are_one_agent_in_either_order() {
        // The provider's word first, then the call that it names.
        let mut agents = Subagents::default();
        let started = running("a1", Some("t1"), Some("Map the popup"), Some(false));
        assert!(agents.apply(std::slice::from_ref(&started), &[]));
        assert!(!agents.apply(&[], &[launch("t1", "Map the popup")]));
        assert_eq!(agents.list().len(), 1);
        // It ran within its call, so the call returning ends it.
        assert!(agents.apply(&[], &[result("t1")]));

        // The call first, then the provider's word.
        let mut agents = Subagents::default();
        agents.apply(&[], &[launch("t1", "Map the popup")]);
        assert!(!agents.apply(&[started], &[]));
        assert_eq!(agents.list().len(), 1);

        // Sent to the background while it runs: now it outlives the call.
        assert!(!agents.apply(&[running("a1", None, None, Some(true))], &[result("t1")]));
        assert_eq!(names(&agents), ["Map the popup"]);
    }

    #[test]
    fn an_agent_only_ever_heard_of_in_passing_is_still_listed() {
        let mut agents = Subagents::default();

        // No start was seen, only that it is at work.
        assert!(agents.apply(&[running("a1", None, Some("Dig through logs"), None)], &[]));
        assert_eq!(names(&agents), ["Dig through logs"]);
        assert!(!agents.settle());

        // One with no name at all gets a plain one.
        assert!(agents.apply(&[running("a2", None, None, Some(true))], &[]));
        assert_eq!(names(&agents), ["Dig through logs", UNNAMED]);
    }

    #[test]
    fn a_new_conversation_starts_with_nothing_running() {
        let mut agents = Subagents::default();
        agents.apply(
            &[running("a1", None, Some("Map the popup"), Some(true))],
            &[],
        );

        agents.clear();
        assert!(agents.list().is_empty());
        // And nothing remembered: the same id would be a different agent.
        agents.apply(
            &[running("a1", None, Some("Something else"), Some(true))],
            &[],
        );
        assert_eq!(names(&agents), ["Something else"]);
    }
}
