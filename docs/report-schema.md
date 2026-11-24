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

Comparison extensions: `changes.new_couplings` and `changes.new_possible_couplings` contain `{source,target,path,certainty}`. The first tracks added explicit session reachability; the second tracks newly possible reachability absent from the baseline's explicit + possible exposure. `certainty` is `explicit-session` or `unspecified-state`. An optional request `protected:["motion-control"]` enables CI policy. `policy` returns `{evaluated, protected, violations, unknown_protected, passed}`. Missing protected services or invalid/incomplete graphs cannot pass. Components also retain `properties:[{name,value,attributes,line}]` for comparison, without validating each property's internal language.

`changes.component_changes:[{name,fields:[{field,before,after}]}]` contains semantic field differences with source lines and graph layers removed. Dependency and launch-option ordering is not a change; repeated environment/ability values preserve order. `changes.modules` is `{added:[name],removed:[name],changed:[{name,before,after}]}` and records module membership changes independently of component changes.

## Imported native recordings

`POST /api/evidence` accepts `{xml,evidence}`. The recording envelope is:

```json
{"schema":"bootweave.native-evidence.v1","configuration":{"name":"risky.xml","sha256":"64 lowercase hex digits"},"environment":{"qnx_uname":"QNX ... 8.0.0 ...","slm_build_id":"..."},"experiment":{"operation":"automatic-failure","subject":"telemetry","trigger":"SIGKILL"},"observations":[{"component":"controller","before_instance":"...","after_instance":"...","restarted":true,"heartbeats_before":10,"heartbeats_after":10}],"artifacts":[{"name":"events.jsonl","sha256":"64 lowercase hex digits"}],"completed":true}
```

The response contains `status:matched|mismatch|incomplete|invalid`, `configuration_matches`, `origin_authenticated:false`, current and recorded SHA-256 values, validated environment/experiment/observation fields, issues, and a notice. A match binds exact UTF-8 XML bytes, including line endings. It **does not authenticate native origin, verify referenced artifact files, prove fresh execution, or establish that the static model is correct**. Artifact names are inert references: the checker never opens paths from imported JSON.

`GET /api/evidence/examples` lists included captured recording envelopes as `[{id,name,filename,evidence}]`; optional native demo configurations are included in `/api/examples` when present. Both standalone-file XML imports and combined API requests are bounded; the total JSON body limit is 4.5 MB.

The CLI equivalent is `python3 -m bootweave evidence config.xml recording.json [--output checked.json]`. It exits 0 for a matching complete envelope, 1 for other binding states, or 2 for file/JSON errors. Static analysis and comparison preserve the XML file's original line endings too.

The browser can export `{schema:"bootweave.review-bundle.v1",static_report,recording:{filename,raw,check}}`. An absent or stale recording check is `null`; imported data is never treated as authenticated evidence. A comparison export retains the selected protected services and complete policy result.
