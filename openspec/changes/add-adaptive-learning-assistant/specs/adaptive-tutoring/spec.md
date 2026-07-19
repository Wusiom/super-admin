## ADDED Requirements

### Requirement: User-Confirmed Learning Contract
The system SHALL require the user to confirm the desired transferable ability, available time, prior knowledge, and learning-unit scope before creating a tutoring session.

#### Scenario: Create a learning contract
- **WHEN** a user confirms a non-empty outcome, time budget, prior-knowledge statement, and at least one unit
- **THEN** the system persists the contract under the user's learning project
- **AND** permits creation of the first tutoring session

#### Scenario: Agent proposes but does not decide the goal
- **WHEN** the Agent generates a suggested outcome or unit sequence
- **THEN** the suggestion remains a draft until the user explicitly confirms it

### Requirement: Durable Tutoring Graph
The system SHALL use LangGraph to execute tutoring turns with PostgreSQL checkpoints and SHALL keep domain state in Prisma/PostgreSQL rather than treating Graph State as business truth.

#### Scenario: Pause for user input
- **WHEN** the graph produces a question, hint choice, note draft, or confirmation request
- **THEN** the graph persists a checkpoint and Interrupt reference
- **AND** stops execution until the user responds

#### Scenario: Resume after closing the page
- **WHEN** a user reopens a session with a pending Interrupt
- **THEN** the system reloads current domain state and the checkpoint
- **AND** resumes from the pending interaction without replaying completed domain writes

#### Scenario: Recover after service restart
- **WHEN** the server restarts while a session is waiting for user input
- **THEN** the session remains resumable from its persisted checkpoint

### Requirement: Constrained Teaching Actions
The tutoring graph SHALL select only from the allowed action set `EXPLAIN`, `ASK_RECALL`, `ASK_SELF_EXPLAIN`, `ASK_TRANSFER`, `GIVE_HINT`, `GIVE_EXAMPLE`, `COMPARE`, `CHALLENGE`, `SUMMARIZE`, and `MAKE_NOTE`.

#### Scenario: Select a next action
- **WHEN** the Agent observes the learning contract, answer, concept evidence, time remaining, and strategy history
- **THEN** it returns a schema-valid `TutorAction` from the allowed set
- **AND** includes the target concepts and user-visible instruction

#### Scenario: Model returns an unknown action
- **WHEN** model output contains an action outside the allowed set or fails the `TutorAction` schema
- **THEN** the system attempts structured repair and the configured fallback model
- **AND** writes no domain-state transition if validation still fails

### Requirement: Independent Grounded Evaluation
The system SHALL evaluate answers in a node separate from teaching-action selection, using a stable rubric and valid anchors from the current source version.

#### Scenario: Evaluate a self-explanation
- **WHEN** a user submits an explanation
- **THEN** the evaluator returns a schema-valid result containing verdict, rubric dimensions, observed strengths, missing boundaries, source anchors, and recommended next evidence need
- **AND** persists evidence only after all referenced anchors validate

#### Scenario: Source and user disagree
- **WHEN** the user's supported reasoning conflicts with the source position
- **THEN** the evaluation distinguishes source consistency from reasoning quality
- **AND** preserves the disagreement instead of silently rewriting the user's claim

### Requirement: Transfer-Based Mastery
The system SHALL mark a concept `TRANSFER_VALIDATED` only after the user succeeds on a materially new scenario that was not directly answered by the learned passage.

#### Scenario: Pass a transfer task
- **WHEN** the evaluator determines that the user correctly applies the concept to a new scenario and explains relevant boundaries
- **THEN** the system records transfer evidence
- **AND** may mark the concept `TRANSFER_VALIDATED`

#### Scenario: Recall without transfer
- **WHEN** a user accurately repeats source terminology but cannot apply it to a new scenario
- **THEN** the system does not mark the concept `TRANSFER_VALIDATED`
- **AND** selects a follow-up action aimed at missing reasoning or boundaries

### Requirement: Idempotent Turn Submission
The system SHALL require an idempotency key for answer submission and Interrupt resume, and SHALL prevent duplicate evidence, notes, or graph transitions.

#### Scenario: Repeat the same answer request
- **WHEN** the client retries an answer submission with the same idempotency key
- **THEN** the system returns the original committed turn result
- **AND** does not create another evidence record or advance the graph twice

#### Scenario: Structure validation ultimately fails
- **WHEN** repair and fallback attempts cannot produce a valid final structure
- **THEN** the system keeps the prior checkpoint and domain state unchanged
- **AND** returns a recoverable error that permits retry

### Requirement: Streaming Turn Progress
The system SHALL stream tutoring-node progress and user-visible model text through authenticated SSE while treating the committed structured result as authoritative.

#### Scenario: Stream a successful turn
- **WHEN** the client submits a valid answer
- **THEN** the server streams node and user-visible progress events
- **AND** emits a final committed event only after the structured result is validated and persisted

#### Scenario: Client disconnects during generation
- **WHEN** the SSE connection closes before the final committed event
- **THEN** the client can query the session by turn and idempotency key
- **AND** observes either the committed result or the unchanged resumable state

