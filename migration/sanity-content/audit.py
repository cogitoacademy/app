"""Audit a published Sanity snapshot without changing the source or any database."""

import argparse
import hashlib
import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen


def references(value):
    if isinstance(value, dict):
        if isinstance(value.get("_ref"), str):
            yield value["_ref"]
        for child in value.values():
            yield from references(child)
    elif isinstance(value, list):
        for child in value:
            yield from references(child)


def audit(documents):
    ids = {doc["_id"] for doc in documents}
    issues = []
    for doc in documents:
        if doc["_type"] not in ("competition", "studentResource"):
            continue
        for ref in references(doc):
            if ref not in ids:
                issues.append({"id": doc["_id"], "issue": "missing_reference", "ref": ref})
        if doc["_type"] == "competition":
            dates = doc.get("eventDate") or {}
            try:
                start = datetime.fromisoformat(dates.get("startDate", ""))
                end = datetime.fromisoformat(dates.get("endDate", ""))
                if start.tzinfo is None or end.tzinfo is None:
                    raise ValueError("missing timezone")
                if end < start:
                    raise ValueError("reversed dates")
            except (ValueError, TypeError):
                issues.append({"id": doc["_id"], "issue": "invalid_date_range", "value": dates})
            title = doc.get("title") or []
            if not any(entry.get("value", "").strip() for entry in title):
                issues.append({"id": doc["_id"], "issue": "missing_title"})
        elif not (doc.get("file") or {}).get("asset", {}).get("_ref"):
            issues.append({"id": doc["_id"], "issue": "missing_resource_file"})
    return {"counts": dict(Counter(doc["_type"] for doc in documents)), "issues": issues}


def single_text(value):
    """Preserve the currently displayed legacy value; never translate content."""
    if isinstance(value, str):
        return value.strip() or None
    if not isinstance(value, list):
        return None
    candidates = [entry for entry in value if isinstance(entry, dict) and isinstance(entry.get("value"), str) and entry["value"].strip()]
    english = next((entry for entry in candidates if entry.get("_key") == "en"), None)
    selected = english or next(iter(candidates), None)
    return selected["value"].strip() if selected else None


def prepare(documents, asset_manifest):
    """Produce a dry-run manifest only; source IDs remain the stable identities."""
    assets = {item["resourceId"]: item for item in asset_manifest if item["status"] == "verified"}
    resources = []
    competitions = []
    selections = []
    for doc in documents:
        kind = doc["_type"]
        if kind not in ("studentResource", "competition"):
            continue
        item = {"id": doc["_id"], "sourceId": doc["_id"], "title": single_text(doc.get("title")), "description": single_text(doc.get("description")), "isActive": True}
        if not item["title"]:
            raise ValueError(f"Missing title: {doc['_id']}")
        if kind == "studentResource":
            asset = assets.get(doc["_id"])
            if asset is None:
                raise ValueError(f"Unverified KB asset: {doc['_id']}")
            item.update(category=doc.get("category"), assetId=asset["assetId"], file=asset["file"], bytes=asset["bytes"], sha256=asset["sha256"])
            resources.append(item)
        else:
            item.update(location=single_text(doc.get("location")), startDate=doc["eventDate"]["startDate"], endDate=doc["eventDate"]["endDate"], categorySourceIds=[ref["_ref"] for ref in doc.get("categories", [])], educationLevels=doc.get("educationLevels", []))
            for field in ("scale", "organizer", "registrationDeadline", "registrationLink", "socialMediaLink"):
                item[field] = doc.get(field)
            competitions.append(item)
            for field in ("title", "description", "location"):
                values = doc.get(field)
                if isinstance(values, list) and len({entry.get("value") for entry in values if isinstance(entry.get("value"), str) and entry["value"].strip()}) > 1:
                    selections.append({"id": doc["_id"], "field": field, "selected": item[field], "sourceValues": values})
    return {"mode": "dry-run-only", "textPolicy": "one language-neutral value per field; legacy English then first nonempty value; no translation", "resources": resources, "competitions": competitions, "legacyTextSelections": selections}


def verify_asset(data, asset):
    if len(data) != asset["size"]:
        raise ValueError("asset byte size mismatch")
    if hashlib.sha1(data).hexdigest() != asset["sha1hash"]:
        raise ValueError("asset source SHA-1 mismatch")
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--download-kb", action="store_true")
    args = parser.parse_args()
    documents = json.loads(args.snapshot.read_text(encoding="utf-8-sig"))
    report = audit(documents)
    report["snapshotSha256"] = hashlib.sha256(args.snapshot.read_bytes()).hexdigest()
    report["scope"] = "published snapshot; drafts and history excluded"
    report["kbAssets"] = []
    by_id = {doc["_id"]: doc for doc in documents}
    for doc in documents:
        if doc["_type"] != "studentResource":
            continue
        ref = (doc.get("file") or {}).get("asset", {}).get("_ref")
        asset = by_id.get(ref)
        if not asset:
            continue
        item = {"resourceId": doc["_id"], "assetId": ref, "status": "not_downloaded"}
        if args.download_kb:
            try:
                url = urlparse(asset["url"])
                if url.scheme != "https" or url.hostname != "cdn.sanity.io":
                    raise ValueError("unexpected asset URL")
                target = args.snapshot.parent / "assets" / Path(url.path).name
                if target.exists():
                    data = target.read_bytes()
                else:
                    with urlopen(asset["url"], timeout=20) as response:
                        if urlparse(response.url).hostname != "cdn.sanity.io":
                            raise ValueError("unexpected redirect")
                        data = response.read(asset["size"] + 1)
                digest = verify_asset(data, asset)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                item.update(status="verified", file=target.name, bytes=len(data), sha256=digest)
            except Exception as error:
                item.update(status="failed", error=str(error))
        report["kbAssets"].append(item)
    output = args.snapshot.parent / "kb-calendar-audit.json"
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(output), "counts": report["counts"], "issues": len(report["issues"]), "kbAssets": report["kbAssets"]}, indent=2))
    if args.download_kb and (len(report["kbAssets"]) != report["counts"].get("studentResource", 0) or any(item["status"] != "verified" for item in report["kbAssets"])):
        raise SystemExit(1)
    if args.download_kb:
        if report["issues"]:
            raise SystemExit("Source validation issues prevent preparing import")
        prepared = prepare(documents, report["kbAssets"])
        (args.snapshot.parent / "kb-calendar-prepared.json").write_text(json.dumps(prepared, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
