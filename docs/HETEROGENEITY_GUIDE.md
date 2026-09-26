# Heterogeneous swarms: authoring guide

How to make robots differ in a Virtual Lab Experiment. This is the human
reference for Initialization and the matching part of the Controller
(`vlab.authoring/0.15`, decisions D-022 and D-023). GPT reads the same rules
from the MCP authoring contract.

## 1. The idea

- **Robots are anonymous.** Nobody gives anything to "robot 7". You describe
  the composition of the swarm.
- **Who differs:** you split the swarm into **groups** of exact size.
- **What differs:** you attach **traits** (values the robot can read) and
  **sensors** to groups.

One reading rule for everything below: **a name in quotes is a name you
chose; a `word=` is a fixed option of the language.** The language gives
your names no meaning. "informed" means *knows the goal* only because your
Controller does something with it.

## 2. Declaring groups

```python
group("informed", fraction=0.2, dimension="information")   # 20% of the robots
group("scouts", count=5, dimension="task")                  # exactly 5 robots
rest_of_group("uninformed", dimension="information")        # everyone else in that dimension
```

| Size | Meaning |
|---|---|
| `fraction=f` | round(f × total) robots, halves rounding up |
| `count=k` | exactly k robots |
| `rest_of_group(name, ...)` | whatever is left in that split |

- Every `group` and `rest_of_group` names its `dimension=`. There are no
  unnamed dimensions.
- Each `group` has exactly one size; each split has at most one
  `rest_of_group`.
- Without a `rest_of_group`, the sizes in a split must add up to its total,
  or the Lab refuses to compile and shows the numbers.
- Declare every group before the first `place(...)` or `group_count(...)`.
- Group names are unique across the Initialization; `"all"` is reserved.

## 3. Splits: dimensions and nesting

A **split** divides some robots into non-overlapping groups.

**A dimension of the whole swarm.**

```python
group("informed", fraction=0.2, dimension="information")
rest_of_group("uninformed", dimension="information")
```

**Several independent dimensions.** Each is exact; how they overlap is left to
chance, reproducibly from the seed. Use this when the paper treats the factors
as independent.

```python
group("informed", fraction=0.2, dimension="information")
rest_of_group("uninformed", dimension="information")

group("equipped", fraction=0.5, dimension="hardware")
rest_of_group("plain", dimension="hardware")
```

**Nesting, for exact joint counts.** `within=` splits one group further. Use
this when the paper fixes the combinations ("3 of the 20 informed robots are
malicious"). Inside a nested split, `fraction=` is a fraction of the parent
group.

```python
group("informed", count=20, dimension="information")
rest_of_group("uninformed", dimension="information")

group("informed_malicious", count=3, dimension="behaviour", within="informed")
rest_of_group("informed_honest", dimension="behaviour", within="informed")
```

## 4. Which robots end up in which group

**Random (default).** The Lab deals each split's members at random from the
seed. Counts are exact in every run; only *which* robots vary with the seed.
Your own placement draws (`rng.uniform(...)`) are unaffected.

**Explicit.** Declare `placement="explicit"` and place each member yourself,
looping over `group_count(...)`. Only groups of whole-swarm dimensions can be
explicit; nested groups are always dealt among the parent's robots.

```python
group("leader", count=1, dimension="rank", placement="explicit")
rest_of_group("followers", dimension="rank")

place(0, 0.0, 0.0, 0.0, group="leader")
for i in range(1, config.N):
    place(i, x, y, heading)          # followers are dealt at random
```

Each explicit group must be placed exactly its count times, and a robot can be
placed explicitly in at most one group.

## 5. Traits: values the robot can read

In the **Controller**, declare the trait with its default:

```python
class Robot(Agent):
    informed = trait(False)   # a trait: set per group, read-only for the robot
    timer = 0.0               # ordinary memory: the robot may change it
```

In **Initialization**, give a group its value, one trait per line:

```python
set_trait("informed", "informed", True)
#          group       trait       value (a number, True or False)
```

- Robots outside the group keep the Controller's default.
- A trait is **read-only** for the robot: `self.informed = ...` is a compile
  error. If a robot must change such a value during the run (it "forgets", or
  switches task), give it its own ordinary variable and start it from the
  trait.
- The trait must be declared with `trait(...)` in the Controller, with the
  same type (number or True/False).
- Metrics can read numeric traits and ordinary memory; True/False traits are
  not readable in Metrics yet.

## 6. Sensors

```python
define_reference("nest", 0.0, 0.0)
equip("informed", "nest", range=5.0)   # informed robots see the nest up to 5 m
equip("all", "nest")                   # every robot, unlimited range
```

The simulator enforces the range: a robot without the sensor, or beyond range,
gets no observation (`obs.references.nest.available` is False).

## 7. What the Lab checks

- **Sizes.** Every split adds up exactly; a mismatch shows the numbers.
- **No conflicts.** A robot must not receive the same trait, or the same
  sensor, from two groups that can share robots (for example a group and a
  group nested in it, or groups of two different dimensions).
- **Traits.** Declared with `trait(...)` in the Controller, never assigned by
  the robot, same type as `set_trait` gives.
- **Report.** After compiling, the Lab and GPT show every group's count by
  split, e.g. "Groups: information: informed 20, uninformed 180; behaviour
  within informed: informed_malicious 3, informed_honest 17."

## 8. What a robot knows

Only its own traits, its own memory and its own sensors. It cannot read its
index, its group, the group sizes, N, the arena size or the run length.

## 9. Complete example

200 robots; 40 informed, of whom exactly 10 are malicious; half the swarm
carries a nest sensor, independently of information.

```python
def initialize(config, rng, place):
    group("informed", count=40, dimension="information")
    rest_of_group("uninformed", dimension="information")
    group("informed_malicious", count=10, dimension="behaviour", within="informed")
    rest_of_group("informed_honest", dimension="behaviour", within="informed")
    group("equipped", fraction=0.5, dimension="hardware")
    rest_of_group("plain", dimension="hardware")

    set_trait("informed", "informed", True)
    set_trait("informed_malicious", "malicious", True)
    define_reference("nest", 0.0, 0.0)
    equip("equipped", "nest", range=5.0)

    for i in range(config.N):
        place(i, rng.uniform(-10.0, 10.0), rng.uniform(-10.0, 10.0), rng.uniform(0.0, TAU))
```

```python
class Robot(Agent):
    informed = trait(False)
    malicious = trait(False)

    def step(self, obs):
        ...
```

## 10. Retired forms

Each gives a compile error that names the replacement.

| Old | New |
|---|---|
| `set_agent_state(i, name, value)` | `group(...)` + `set_trait(group, trait, value)` |
| `role(...)`, `role_count(...)` | `group(...)`, `group_count(...)` |
| `set_state(group, name=value)` | `set_trait(group, "name", value)` |
| `rest=True` | `rest_of_group(name, dimension=...)` |
| `partition=` | `dimension=` |
| `set_agent_reference_sensor(i, name, range)` | `equip(group, reference, range=...)` |
| Controller `name = 0.0` set from Initialization | `name = trait(0.0)` |
