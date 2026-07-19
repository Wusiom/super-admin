## ADDED Requirements

### Requirement: Evidence-Based Strategy Profile
The system SHALL update teaching-strategy preferences only from evaluated tutoring outcomes and SHALL store the evidence that supports each profile entry.

#### Scenario: Strategy improves an evaluated outcome
- **WHEN** an evaluated sequence shows that a teaching strategy helped the user produce stronger independent reasoning
- **THEN** the system may increase the strategy's preference weight
- **AND** records the sessions, turns, evaluation dimensions, and confidence supporting the update

#### Scenario: No evaluated outcome exists
- **WHEN** a strategy was displayed but no valid answer evaluation followed
- **THEN** the system does not update the learner profile from that interaction

### Requirement: Stable Evaluation Boundary
The learner profile SHALL influence teaching-action selection but MUST NOT change evaluation rubrics, authorization, source-grounding rules, or mastery thresholds.

#### Scenario: Apply a preferred teaching strategy
- **WHEN** the graph selects the next teaching action
- **THEN** it may use enabled strategy preferences as input
- **AND** the independent evaluator continues to use the same stable rubric

#### Scenario: Profile text attempts to change permissions
- **WHEN** stored profile data contains text resembling a permission or tool instruction
- **THEN** the system treats it as untrusted data
- **AND** does not change tools, permissions, output schemas, or thresholds

### Requirement: User Profile Transparency
The system SHALL let users view each inferred strategy, its confidence, supporting evidence, and effect on teaching behavior.

#### Scenario: View profile details
- **WHEN** a user opens `/learning/profile`
- **THEN** the page lists strategies with evidence references and a plain-language explanation of their effect
- **AND** does not claim unsupported personality, occupation, or ability traits

#### Scenario: Insufficient evidence
- **WHEN** no strategy meets the minimum evidence threshold
- **THEN** the page displays that the default strategy is in use
- **AND** does not manufacture a profile

### Requirement: User Profile Control
The system SHALL allow users to disable a strategy, delete a supporting evidence reference, disable all personalization, or reset the profile.

#### Scenario: Disable one strategy
- **WHEN** a user disables a strategy
- **THEN** future graph decisions exclude that strategy preference
- **AND** existing learning evidence remains unchanged

#### Scenario: Reset the learner profile
- **WHEN** a user confirms a profile reset
- **THEN** all inferred strategy preferences and profile evidence references are deleted
- **AND** future sessions use default teaching strategy behavior

