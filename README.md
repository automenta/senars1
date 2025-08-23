# SeNARS

## TODO
 [ ] language: TypeScript
 [ ] build: package.json, vite
 [ ] dependencies: langchain.js (latest version)
 [ ] core `core.md`
 [ ] unit tests
 [ ] gui `gui.md`
 
SeNARS is a cognitive architecture: designed to model and simulate human-like reasoning and learning. It features a sophisticated core reasoning engine and a "Thinking TODO List" user interface to visualize the cognitive process.

## Core
*   **Real-time Cognitive Cycle:** Implements a continuous loop of perception, reasoning, and action.
*   **Semantic and Symbolic Processing:** Combines neural-like semantic representations (vectors) with symbolic reasoning (S-Expressions).
*   **Dynamic Attention Mechanism:** Prioritizes tasks and knowledge using a sophisticated attention and truth value system.
*   **Extensible Schema System:** Allows for the definition of cognitive schemas (rules) that can be applied to reason about tasks and derive new knowledge.
*   **Scope and Procedure Execution:** Supports scoped variables and executable procedures, enabling more complex and dynamic reasoning.
*   **Thread-Safe Design:** The core `WorldModel` and `Agenda` are designed for concurrent access by multiple worker threads.

## GUI
*   **"Thinking TODO List" Interface:** Visualizes the cognitive process as a dynamic and interactive to-do list.
*   **Active Thoughts Panel:** Displays the current priority queue of tasks (thoughts) being processed by the system.
*   **Knowledge Base:** Shows completed thoughts and integrated beliefs, representing the system's accumulated knowledge.
*   **Natural Language Input:** Allows users to input new thoughts and goals in natural language.
*   **Cognitive Metrics:** Provides a dashboard with real-time metrics on the system's attention, memory, and energy.
*   **Interactive Debugging:** Offers different user modes (Thinking, Learning, Expert, Debugger) for interacting with and understanding the cognitive process.
