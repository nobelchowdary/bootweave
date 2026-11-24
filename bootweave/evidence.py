"""Bind imported native recordings to a configuration without authenticating them."""

from copy import deepcopy
import hashlib
import re

SCHEMA = "bootweave.native-evidence.v1"
NOTICE = ("Imported recording. A matching configuration hash binds this recording to these XML bytes; "
          "it does not authenticate its origin or prove a fresh QNX execution. Static analysis and recorded observations are separate.")
_DIGEST = re.compile(r"[0-9a-f]{64}")


def check_evidence(xml, evidence):
    """Validate the small recording envelope; never execute or open its artifacts."""
    digest = hashlib.sha256(xml.encode("utf-8", errors="surrogatepass")).hexdigest()
    result = {"status": "invalid", "configuration_matches": False, "origin_authenticated": False,
              "configuration_sha256": digest, "recorded_sha256": None, "environment": {},
              "experiment": {}, "observations": [], "issues": [], "notice": NOTICE}
    issues = result["issues"]
    if not isinstance(evidence, dict) or evidence.get("schema") != SCHEMA:
        issues.append(f"Expected recording schema {SCHEMA}.")
        return result
    configuration = evidence.get("configuration")
    if not isinstance(configuration, dict) or not isinstance(configuration.get("sha256"), str) or not _DIGEST.fullmatch(configuration["sha256"]):
        issues.append("Recording must contain a lowercase SHA-256 configuration digest.")
        return result
    recorded = configuration["sha256"]
    result["recorded_sha256"] = recorded
    result["configuration_matches"] = recorded == digest
    environment, experiment = evidence.get("environment"), evidence.get("experiment")
    observations = evidence.get("observations")
    if not isinstance(environment, dict) or not all(isinstance(environment.get(k), str) and environment[k].strip()
                                                  for k in ("qnx_uname", "slm_build_id")):
        issues.append("Recording must identify the QNX version and SLM build.")
    else:
        result["environment"] = deepcopy(environment)
    if not isinstance(experiment, dict) or not all(isinstance(experiment.get(k), str) and experiment[k].strip()
                                                 for k in ("operation", "subject", "trigger")):
        issues.append("Recording must describe its operation, subject and trigger.")
    else:
        result["experiment"] = deepcopy(experiment)
    if not isinstance(observations, list) or not 1 <= len(observations) <= 250:
        issues.append("Recording must contain 1–250 component observations.")
    else:
        names = set()
        for observation in observations:
            if not isinstance(observation, dict):
                issues.append("Every observation must be an object.")
                break
            name = observation.get("component")
            instances = [observation.get(k) for k in ("before_instance", "after_instance")]
            counts = [observation.get(k) for k in ("heartbeats_before", "heartbeats_after")]
            if (not isinstance(name, str) or not name or name in names
                    or not all(isinstance(v, str) and v for v in instances)
                    or not all(type(v) is int and v >= 0 for v in counts)
                    or type(observation.get("restarted")) is not bool):
                issues.append("Observations require unique components, instance identifiers, nonnegative heartbeat counts and a restarted boolean.")
                break
            if observation["restarted"] != (instances[0] != instances[1]):
                issues.append(f"Restart flag disagrees with recorded instance identifiers for {name}.")
                break
            names.add(name)
        else:
            result["observations"] = deepcopy(observations)
    artifacts = evidence.get("artifacts", [])
    if not isinstance(artifacts, list) or len(artifacts) > 100 or any(
            not isinstance(a, dict) or not isinstance(a.get("name"), str) or not a["name"]
            or not isinstance(a.get("sha256"), str) or not _DIGEST.fullmatch(a["sha256"]) for a in artifacts):
        issues.append("Artifact references must contain names and lowercase SHA-256 digests.")
    if issues:
        return result
    if evidence.get("completed") is not True:
        result["status"] = "incomplete"
        issues.append("The recorder did not mark this experiment complete.")
    elif recorded != digest:
        result["status"] = "mismatch"
        issues.append("Recorded configuration differs from the active XML; do not associate these observations with it.")
    else:
        result["status"] = "matched"
    return result
