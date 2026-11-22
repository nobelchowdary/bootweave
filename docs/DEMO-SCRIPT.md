# BootWeave demo storyboard — 2 minutes 40 seconds

Working draft. Record only behavior actually demonstrated in the final build. Use the BootWeave UI and your own terminal; no third-party artwork or music is needed. The intended platform for this submission is the host computer. Identify target verification separately when available.

| Time | Show | Explain |
| --- | --- | --- |
| 0:00–0:15 | Workbench, risky configuration, dashboard selected | “A startup configuration is also a lifecycle contract. One misplaced dependency can connect an optional dashboard to a controller.” |
| 0:15–0:45 | Highlight dashboard → motion-control → operator-ui, open exact XML line | “BootWeave reads QNX 8.0 SLM XML. It explains explicit session coupling and preserves uncertainty when a dependency state is omitted.” |
| 0:45–1:10 | Change review: risky → reviewed | “Removing this optional prerequisite removes a startup dependency and its session coupling. Here are the component changes and the resolved fixed-delay review prompt.” |
| 1:10–1:40 | Terminal CI commands below, actual exit status | “The same engine can guard a protected service during review. This regression fails; the correction passes.” |
| 1:40–2:00 | Import malformed/cyclic example, visible errors | “Unsupported or broken configurations cannot receive a complete clean result.” |
| 2:00–2:25 | Actual QNX validation evidence, if obtained; otherwise show host report export and source hash | State exactly what was tested. Until target validation exists: “This is a working host analyzer. Recovery sets are static graph analysis; native SLM validation is still outstanding.” |
| 2:25–2:40 | Workbench plus repository and tutorial links when public | “Review startup dependencies before deployment. BootWeave is open source, local, and reproducible.” |

Run each command from the repository in a POSIX shell. The first exit status should be 1, the second 0. Print the observed status, without editing outputs.

```sh
python3 -m bootweave compare examples/robot-revised.xml examples/robot-risky.xml --protect motion-control
echo "Exit status: $?"
python3 -m bootweave compare examples/robot-risky.xml examples/robot-revised.xml --protect motion-control
echo "Exit status: $?"
```

Before recording, close unrelated tabs, hide personal paths or accounts, choose a readable viewport, and reset samples. The robot examples describe authored configurations; their executables are illustrative. Do not present them as running robot software. Do not describe the analyzer as a certification tool or claim measured boot/recovery timing.
