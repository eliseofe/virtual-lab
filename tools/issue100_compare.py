#!/usr/bin/env python3
import sys

old_path, new_path = sys.argv[1], sys.argv[2]

with open(old_path, "r", encoding="utf-8") as old_file, open(new_path, "r", encoding="utf-8") as new_file:
    tick = 0
    while True:
        old_line = old_file.readline()
        new_line = new_file.readline()
        if not old_line and not new_line:
            print(f"RESULT=IDENTICAL ticks={tick} comparison=bitwise-state")
            break
        if not old_line or not new_line:
            print(f"RESULT=DIVERGENT first_tick={tick + 1} reason=length-mismatch")
            break
        tick += 1
        if old_line == new_line:
            continue

        old_tick, old_payload = old_line.rstrip("\n").split("|", 1)
        new_tick, new_payload = new_line.rstrip("\n").split("|", 1)
        if old_tick != new_tick:
            print(f"RESULT=DIVERGENT first_tick={tick} reason=tick-number old={old_tick} new={new_tick}")
            break

        old_agents = old_payload.split(";")
        new_agents = new_payload.split(";")
        if len(old_agents) != len(new_agents):
            print(f"RESULT=DIVERGENT first_tick={tick} reason=agent-count old={len(old_agents)} new={len(new_agents)}")
            break

        names = ("x", "y", "heading")
        found = False
        for agent_index, (old_agent, new_agent) in enumerate(zip(old_agents, new_agents)):
            old_values = old_agent.split(",")
            new_values = new_agent.split(",")
            for component, (old_value, new_value) in enumerate(zip(old_values, new_values)):
                if old_value != new_value:
                    print(
                        f"RESULT=DIVERGENT first_tick={tick} agent={agent_index} "
                        f"component={names[component]} old_bits={old_value} new_bits={new_value}"
                    )
                    found = True
                    break
            if found:
                break
        if not found:
            print(f"RESULT=DIVERGENT first_tick={tick} reason=unclassified-line-difference")
        break
