# Host report contract (v1)

`bootweave.analyzer.analyze(xml, filename="config.xml")` returns a JSON-serializable dict.
No target process runs. The analysis is a conservative static review of QNX 8.0 SLM configuration.

```json
{
  "schema_version": 1,
  "source": {"name":"config.xml", "sha256":"..."},
  "analysis_complete": true,
  "components": [{"name":"camera", "line":2, "command":"/bin/camera", "args":"", "launch":[], "wait":{"mode":"pathname","value":"/dev/camera","poll_ms":null,"timeout_ms":null}, "repair":{"mode":"default","backoff_seconds":null}, "dependencies":[{"name":"io-sock","state":"session","line":3}], "layer":1}],
  "modules": [{"name":"all", "members":["camera"], "line":20}],
  "edges": [{"source":"io-sock", "target":"camera", "state":"session", "line":3}],
  "layers": [["io-sock"],["camera"]],
  "findings": [{"id":"BW001","severity":"error","component":"camera","line":3,"title":"Missing prerequisite","detail":"...","recommendation":"...","doc_url":"https://qnx.com/developers/docs/8.0/com.qnx.doc.neutrino.utilities/topic/s/slm.html"}],
  "summary": {"components":2,"dependencies":1,"errors":0,"warnings":0,"infos":0,"valid_graph":true},
  "impacts": {"io-sock":{"selected":"io-sock","startup_blocked":["camera"],"coupled":["camera"],"possible":[],"independent":[],"critical":false,"paths":[{"component":"camera","path":["io-sock","camera"],"certainty":"explicit-session"}]}}
}
```

`analysis_complete=false` means rejected/unsupported syntax or invalid structure; never a green result. Graph errors set `valid_graph=false`. Impacts for invalid or incomplete graphs must be empty. Components sorted in source order; sets and traversals deterministic.

Coupling is **not a runtime simulator**: `coupled` is reachability only over explicit `state="session"` edges; `possible` reaches through at least one unspecified edge but no stateless edge, excluding coupled; `independent` includes the remaining services except the selected service. Unspecified state has no documented default in the cited reference. `startup_blocked` traverses all dependency edges. `critical` is true only when the selected command has launch='critical'; unexpected death may crash the system. Repair policies, SLM command-line options, runtime state, and manual slmctl operations can change actual recovery. All evidence is static until target validation.

HTTP API: `GET /api/examples` -> `[{id,name,description,filename,xml}]`. `POST /api/analyze` with `{xml,filename}` -> report. `POST /api/compare` with `{before,after,before_name,after_name}` -> `{before:report,after:report,changes:{added_components:[],removed_components:[],changed_components:[],added_edges:[],removed_edges:[],resolved_findings:[],new_findings:[]}}`. Edge changes use full `{source,target,state,line}` objects. Findings retain full shape. `GET /` serves UI. Frontend may offer report JSON download locally.

Comparison extensions: `changes.new_couplings` and `changes.new_possible_couplings` contain `{source,target,path,certainty}`. The first tracks added explicit session reachability; the second tracks newly possible reachability absent from the baseline's explicit + possible exposure. `certainty` is `explicit-session` or `unspecified-state`. An optional request `protected:["motion-control"]` enables CI policy. `policy` returns `{evaluated, protected, violations, unknown_protected, passed}`. Missing protected services or invalid/incomplete graphs cannot pass. Components also retain `properties:[{name,value,attributes,line}]` for comparison, without validating each property's internal language. Standalone module change summaries are not yet provided.
