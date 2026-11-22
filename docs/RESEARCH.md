# Idea selection — November 22, 2026

The starting constraints are an Apple Silicon Mac, no QNX SDK or target, a preference for a visual developer tool, and roughly three weeks until submission. The following ranking is our engineering judgment, not a prediction of prizes or proof of market novelty.

| Direction | Research observation | Judgment for this project |
| --- | --- | --- |
| Runtime deadline/IPC dashboard | [QNX System Profiler](https://qnx.com/developers/docs/8.0/com.qnx.doc.qnxtoolkit.user_guide/topic/using_the_system_profiler.html) already exposes kernel activity. Current entrants include [PulseGuard](https://github.com/samertall/pulseguard-rt), [Deadline Lab](https://github.com/Whyme-Labs/deadline-lab), and [qnx-ipcscope](https://github.com/CVasilopoulos/qnx-ipcscope). | Useful, but hard to distinguish quickly and requires target traces. |
| Resource-manager generator/test kit | [resmgr-kit](https://devpost.com/software/resmgr-kit) already combines generation and QNX build/test workflows. | Strong native connection, substantial overlap. |
| Boot image explorer | [mkifs](https://qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/m/mkifs.html) provides recursive library discovery; [dumpifs](https://qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/d/dumpifs.html) exposes image contents. | A useful future tool would need explained artifact changes, not only a dependency list. Authentic image fixtures currently unavailable. |
| **SLM configuration change review** | [SLM](https://qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/s/slm.html) defines dependency-driven launch and lifecycle behavior. [CANopy](https://devpost.com/software/canopy-a-qnx-8-0-incident-recorder-for-can-driver-crashes) is adjacent runtime evidence tooling. Targeted searches found no direct SLM change-review counterpart. | **Best fit:** a working host analyzer is feasible immediately, with a clear review/CI story and QNX-specific input. |

BootWeave's demonstration question is concrete: **Does this configuration edit newly couple an essential service to an optional prerequisite?** The visual graph explains the path, the comparison explains the change, and the CLI can reject the expansion. Source hashes connect exported evidence to the input.

The hypothesis still needs validation with QNX developers and native SLM. Session coupling is conditional configuration analysis; it is not measured failure behavior. Native SLM already rejects cycles, so cycle detection is a supporting feature rather than the novelty claim. A product that gets these distinctions right is more credible than one that invents performance gains from static XML.

No AI feature is needed for the core result. An optional future explanation assistant must cite deterministic findings and must not decide deployment safety. Scope additions should follow user feedback and target validation.
