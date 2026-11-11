#!/usr/bin/env python3
"""
Nebula Expense Tracker — Pure-Python Google Wallet / Cloud Reconciler (`wallet_reconcile.py`)

Designed for both:
  1. Cloud-native Gemini Scheduled Tasks (no Node.js runtime or repo checkout required;
     100% Python 3 standard library, pairing with `gsheets` / `gdrive` CLIs).
  2. Local CLI execution alongside `ingest_transactions.py`.

Features:
  - 7-day rolling lookback (`T-7` to `Today`) compared against a 14-day active settlement
    window + full sheet history for Stage 1 History Memory and exact SHA-256 deduplication.
  - Deterministic SHA-256 hash: `sha256(f"{date}|{description.strip().lower()}|{amount:.2f}|{type}")`.
  - Month-end Bilt housing date normalization (`days 28..31` and `amount >= minAmount` -> `YYYY-(M+1)-01`)
    with dual aliasHashes (`raw_hash[:16]` and `norm_hash[:16]`) so each calendar month has exactly one
    mortgage expense and re-runs across month boundaries are 100% idempotent.
  - Tombstone filtering from `Notes` tab (`__meta_ingest_state__` + `__meta_ingest_tombstones_1__..5__`)
    so user-deleted rows are never resurrected during a 7-day rolling lookback.
  - Occurrence-aware deduplication (`claimed_existing_ids` + `created_in_batch_ids`), Pending -> Settled
    (`Purchase`) in-place upgrade (same hash, ±3d settlement drift, or `transfers-cc` description shift),
    and restaurant tip drift (+0..3d, +1%..35% tip on provisional/Pending charges).
  - Multi-account Google Wallet (`gpay-plaid`) producer rules:
    account labels (`7702`->`bilt`, `9666`->`manoj bofa`, `8885`/`6823`->`priyanka chase`,
    `4692`->`bofa atmos`, `4359`/`4558`->`wells fargo`), Bilt Housing pass-through legs,
    credit card bill payoffs, and known recurring ACH rules.
  - Outputs 12-column (`Transactions!A:L`) rows with `meta` JSON in Column L and optional
    `--batch-out` file directly consumable by `gsheets mutate batch <SPREADSHEET_ID> -f <file>`.
"""

import argparse
import csv
import datetime
import hashlib
import json
import os
import re
import sys
import uuid
from typing import Any, Dict, List, Optional, Set, Tuple

MAX_INLINE_TOMBSTONES = 400
TOMBSTONE_CHUNK_SIZE = 400
MAX_TOMBSTONE_CHUNKS = 5
MAX_TOTAL_TOMBSTONES = MAX_INLINE_TOMBSTONES + (TOMBSTONE_CHUNK_SIZE * MAX_TOMBSTONE_CHUNKS)

DEFAULT_WORD_BOUNDARY_KEYWORDS: List[str] = [
    "bar",
    "pub",
    "inn",
    "vet",
    "gas",
    "shell",
    "76",
    "gap",
    "rei",
    "ups",
    "irs",
    "hoa",
    "pud",
    "pse",
    "spa",
    "nail",
]

DEFAULT_CATEGORY_KEYWORDS: List[Dict[str, Any]] = [
    {
        "category": "groceries",
        "subCategory": "groceries-costco",
        "spendingBucket": "flexible",
        "keywords": ["costco"],
    },
    {
        "category": "groceries",
        "subCategory": "groceries-instacart",
        "spendingBucket": "flexible",
        "keywords": ["instacart"],
    },
    {
        "category": "groceries",
        "subCategory": "groceries-supermarket",
        "spendingBucket": "flexible",
        "keywords": [
            "whole foods",
            "trader joe",
            "safeway",
            "kroger",
            "aldi",
            "sprouts",
            "mayuri",
            "fred meyer",
            "jd's market",
            "jds market",
            "ranch 99",
            "99 ranch",
            "qfc",
            "h mart",
            "hmart",
            "grocery",
            "groceries",
            "supermarket",
        ],
    },
    {
        "category": "food",
        "subCategory": "food-takeout",
        "spendingBucket": "flexible",
        "keywords": [
            "doordash",
            "ubereats",
            "uber eats",
            "grubhub",
            "chipotle",
            "sweetgreen",
            "starbucks",
            "blue bottle",
            "coffee",
            "cafe",
            "bakery",
            "takeout",
            "delivery",
        ],
    },
    {
        "category": "food",
        "subCategory": "food-dine-in",
        "spendingBucket": "flexible",
        "keywords": [
            "restaurant",
            "diner",
            "bistro",
            "sushi",
            "osteria",
            "pizza",
            "dining",
            "food & drink",
            "food and drink",
        ],
    },
    {
        "category": "utilities",
        "subCategory": "utilities-electric",
        "spendingBucket": "fixed",
        "keywords": ["electric", "power", "pge", "pg&e", "snohomish county pud"],
    },
    {
        "category": "utilities",
        "subCategory": "utilities-water",
        "spendingBucket": "fixed",
        "keywords": ["water", "sewer", "trash", "waste management", "alderwood water"],
    },
    {
        "category": "utilities",
        "subCategory": "utilities-gas",
        "spendingBucket": "fixed",
        "keywords": ["puget sound energy", "puget heating", "heating"],
    },
    {
        "category": "utilities",
        "subCategory": "utilities-internet",
        "spendingBucket": "fixed",
        "keywords": ["internet", "wifi", "comcast", "xfinity", "broadband", "ziply"],
    },
    {
        "category": "utilities",
        "subCategory": "utilities-phone",
        "spendingBucket": "fixed",
        "keywords": ["verizon", "at&t", "t-mobile", "google fi"],
    },
    {
        "category": "entertainment",
        "subCategory": "entertainment-subs",
        "spendingBucket": "fixed",
        "keywords": [
            "netflix",
            "spotify",
            "hulu",
            "hbo",
            "youtube premium",
            "apple tv",
            "disney",
            "google one",
            "subscription",
        ],
    },
    {
        "category": "entertainment",
        "subCategory": "entertainment-movies",
        "spendingBucket": "flexible",
        "keywords": [
            "movie",
            "cinema",
            "theater",
            "concert",
            "ticket",
            "amusement",
            "recreation center",
        ],
    },
    {
        "category": "transport",
        "subCategory": "transport-fuel",
        "spendingBucket": "flexible",
        "keywords": ["chevron", "shell", "7-eleven", "arco", "mobil", "exxon", "fuel"],
    },
    {
        "category": "transport",
        "subCategory": "transport-transit",
        "spendingBucket": "flexible",
        "keywords": [
            "uber",
            "lyft",
            "transit",
            "subway",
            "train",
            "parking",
            "waymo",
            "good to go",
            "wsdot",
            "supercharger",
            "tesla",
        ],
    },
    {
        "category": "transport",
        "subCategory": "transport-maint",
        "spendingBucket": "non-monthly",
        "keywords": ["car wash", "geico", "progressive", "auto repair"],
    },
    {
        "category": "travel",
        "subCategory": "travel-flights",
        "spendingBucket": "non-monthly",
        "keywords": [
            "airline",
            "delta air",
            "united air",
            "american air",
            "alaska air",
            "flight",
        ],
    },
    {
        "category": "travel",
        "subCategory": "travel-hotels",
        "spendingBucket": "non-monthly",
        "keywords": ["hotel", "airbnb", "marriott", "hilton", "hyatt", "resort", "lodging"],
    },
    {
        "category": "travel",
        "subCategory": "travel-car",
        "spendingBucket": "non-monthly",
        "keywords": ["hertz", "avis", "enterprise rent"],
    },
    {
        "category": "healthcare",
        "subCategory": "healthcare-pharmacy",
        "spendingBucket": "flexible",
        "keywords": ["pharmacy", "cvs", "walgreens"],
    },
    {
        "category": "healthcare",
        "subCategory": "healthcare-dental",
        "spendingBucket": "flexible",
        "keywords": ["dentist", "dental", "vision", "optometry"],
    },
    {
        "category": "healthcare",
        "subCategory": "healthcare-doctor",
        "spendingBucket": "flexible",
        "keywords": [
            "doctor",
            "medical",
            "copay",
            "clinic",
            "hospital",
            "harborview",
            "evergreenhealth",
            "uw medicine",
        ],
    },
    {
        "category": "shopping",
        "subCategory": "shopping-amazon",
        "spendingBucket": "flexible",
        "keywords": ["amazon", "amzn", "amz*"],
    },
    {
        "category": "shopping",
        "subCategory": "shopping-apparel",
        "spendingBucket": "flexible",
        "keywords": [
            "apparel",
            "clothing",
            "nike",
            "uniqlo",
            "nordstrom",
            "macys",
            "zara",
            "stitch fix",
        ],
    },
    {
        "category": "misc",
        "subCategory": "misc-salon",
        "spendingBucket": "flexible",
        "keywords": ["salon", "barber", "haircut", "spa", "nail"],
    },
]

DEFAULT_RULES: Dict[str, Any] = {
    "defaultSpreadsheetId": "1Whmjhktu_sgdw9WYFYx9JydpB61JU2RGuCm7AT_USLY",
    "spreadsheetName": "Nebula Expense - PriyMan",
    "sourceId": "gpay-plaid",
    "lookbackDays": 7,
    "sheetWindowDays": 14,
    "accountMap": {
        "7702": {"label": "bilt", "displayName": "Bilt Palladium (7702)"},
        "9666": {"label": "manoj bofa", "displayName": "BofA SafeBalance (9666)"},
        "8885": {"label": "priyanka chase", "displayName": "Chase Total Checking (8885)"},
        "4692": {"label": "bofa atmos", "displayName": "BofA Atmos Ascent Visa (4692)"},
        "4359": {"label": "wells fargo", "displayName": "Wells Fargo Checking (4359)"},
        "6823": {"label": "priyanka chase", "displayName": "Chase Savings (6823)"},
        "4558": {"label": "wells fargo", "displayName": "Wells Fargo Way2Save (4558)"},
    },
    "biltHousingRules": [
        {
            "pattern": r"^bilt\s+housing\s+payment$",
            "account": "7702",
            "type": "expense",
            "category": "housing",
            "subCategory": "housing-mortgage",
            "spendingBucket": "fixed",
            "description": "Bilt Housing Payment",
            "normalizeMonthEndToFirstOfNextMonth": True,
            "minAmount": 1000,
        },
        {
            "pattern": r"^payment\s*-\s*bilt\s+housing$",
            "account": "7702",
            "type": "transfer",
            "category": "housing",
            "subCategory": "housing-mortgage",
            "spendingBucket": None,
            "description": "Payment - Bilt Housing",
            "normalizeMonthEndToFirstOfNextMonth": True,
            "minAmount": 1000,
        },
        {
            "pattern": r"bilt\s+card\s+des:housing",
            "account": "9666",
            "type": "transfer",
            "category": "housing",
            "subCategory": "housing-mortgage",
            "spendingBucket": None,
            "description": "Bilt",
            "preserveRawInNotes": True,
        },
    ],
    "creditCardPayoffPatterns": [
        r"\bbilt\s+card\s+pmt\b",
        r"\bamazon\s+corp\s+syf\s+paymn?t\b",
        r"\bsyf\s+paymn?t\b",
        r"\bpayment\s+to\s+crd\b",
        r"\bpending\s+payment\b",
        r"^payment$",
        r"\bpayment\s*-?\s*thank\s+you\b",
        r"\bcredit\s+card\s+payment\b",
        r"\bsynchrony\s+bank\s+payment\b",
        r"\bchase\s+credit\s+crd\b",
        r"\bciti\s+autopay\b",
        r"\bamex\s+epayment\b",
        r"\bwells\s+fargo\s+payment\b",
        r"\bpayment\s+from\s+chk\b",
    ],
    "knownRecurringRules": [
        {
            "pattern": r"\bwoodinville\s+8609257058\b",
            "type": "expense",
            "category": "child-care",
            "subCategory": None,
            "spendingBucket": "fixed",
            "confidence": 0.96,
        },
        {
            "pattern": r"\bzg\s*-\s*your\s+rental\b|\byour\s+rental\s+rent\b",
            "type": "income",
            "category": "income",
            "subCategory": "income-investment",
            "spendingBucket": None,
            "confidence": 0.96,
        },
        {
            "pattern": r"\bgoogle\s+llc\s+payroll\b|^google$",
            "requireIncomeContext": True,
            "type": "income",
            "category": "income",
            "subCategory": "income-salary",
            "spendingBucket": None,
            "confidence": 0.96,
        },
        {
            "pattern": r"\bpuget\s+sound\s+energy\b|\bpuget\s+heating\b",
            "type": "expense",
            "category": "utilities",
            "subCategory": "utilities-gas",
            "spendingBucket": "fixed",
            "confidence": 0.95,
        },
        {
            "pattern": r"\bsnohomish\s+county\s+pud\b",
            "type": "expense",
            "category": "utilities",
            "subCategory": "utilities-electric",
            "spendingBucket": "fixed",
            "confidence": 0.95,
        },
        {
            "pattern": r"\balderwood\s+water\b|\bwaste\s+management\b",
            "type": "expense",
            "category": "utilities",
            "subCategory": "utilities-water",
            "spendingBucket": "fixed",
            "confidence": 0.95,
        },
        {
            "pattern": r"\bgoogle\s+fi\b",
            "type": "expense",
            "category": "utilities",
            "subCategory": "utilities-phone",
            "spendingBucket": "fixed",
            "confidence": 0.95,
        },
        {
            "pattern": r"\bziply\b",
            "type": "expense",
            "category": "utilities",
            "subCategory": "utilities-internet",
            "spendingBucket": "fixed",
            "confidence": 0.95,
        },
        {
            "pattern": r"\bgoogle\s+one\b",
            "type": "expense",
            "category": "entertainment",
            "subCategory": "entertainment-subs",
            "spendingBucket": "fixed",
            "confidence": 0.95,
        },
        {
            "pattern": r"\beastside\s+exterminators\b",
            "type": "expense",
            "category": "housing",
            "subCategory": "housing-hoa",
            "spendingBucket": "fixed",
            "confidence": 0.95,
        },
        {
            "pattern": r"\bgoogle\s+store\b",
            "type": "expense",
            "category": "merchandise",
            "subCategory": "merchandise-electronics",
            "spendingBucket": "flexible",
            "confidence": 0.92,
        },
        {
            "pattern": r"\bmel'?s\s+barber\b",
            "type": "expense",
            "category": "misc",
            "subCategory": "misc-salon",
            "spendingBucket": "flexible",
            "confidence": 0.92,
        },
    ],
    "wordBoundaryKeywords": DEFAULT_WORD_BOUNDARY_KEYWORDS,
    "categoryKeywords": DEFAULT_CATEGORY_KEYWORDS,
}

GENERIC_PAYMENT_RAILS: Set[str] = {
    "zelle",
    "venmo",
    "paypal",
    "cash app",
    "cashapp",
    "ach",
    "wire",
    "check",
    "payment",
}

MULTI_CATEGORY_MARKETPLACES: Set[str] = {
    "amazon",
    "target",
    "walmart",
    "costco",
    "sams club",
    "fred meyer",
    "meijer",
    "bj s wholesale",
}

PROCESSOR_PREFIX_RE = re.compile(
    r"^(?:sq\s*\*|tst\s*\*|pp\s*\*|paypal\s*\*|sp\s*\*|awl\s*\*|dd\s*\*|doordash\s*\*|uber\s*\*|caviar\s*\*|toast\s*\*)\s*",
    re.IGNORECASE,
)

TRAILING_STORE_RE = re.compile(
    r"\s+(?:#\s*\d+|\bstore\s*#?\s*\d+|\b(?:ca|ny|tx|wa|fl|il|nj|va|ga|nc|mi|az|co|nv|md|mn|wi|tn|ut|ct|sc|ky|al|nh|ri|mt|sd|nd|ak|vt|wy|dc)\b|\b\d{4,}\b|\b\d{3}-\d{3}-\d{4}\b)+$",
    re.IGNORECASE,
)


def compute_tx_hash(date_str: str, description: str, amount: float, tx_type: str) -> str:
    """Computes the canonical Nebula SHA-256 transaction hash."""
    clean_date = (date_str or "").strip()[:10]
    clean_desc = (description or "").strip().lower()
    clean_amt = f"{abs(float(amount)):.2f}"
    clean_type = (tx_type or "expense").strip().lower()
    raw = f"{clean_date}|{clean_desc}|{clean_amt}|{clean_type}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def normalize_merchant_name(raw: str) -> str:
    if not raw:
        return ""
    s = raw.strip()
    s = PROCESSOR_PREFIX_RE.sub("", s)
    if re.match(r"^amazon\s*:", s, re.IGNORECASE):
        return "amazon"
    if re.search(
        r"\b(?:amzn|amazon\.com|amazon\s+mktp|amazon\s+marketplace|synchrony\s+amazon|amz\*amazon)\b",
        s,
        re.IGNORECASE,
    ):
        return "amazon"
    s = re.sub(r"\*[a-z0-9]+", " ", s, flags=re.IGNORECASE)
    s = re.sub(r"[_/|]+", " ", s)
    s = re.sub(r"\bst-[a-z0-9]{6,}\b", " ", s, flags=re.IGNORECASE)
    s = re.sub(r"\s+", " ", s).strip()
    s = TRAILING_STORE_RE.sub("", s).strip()
    s = re.sub(r"[#*.,:;!?()-]+$", "", s).strip()
    return s.lower()


def get_merchant_family(raw: str) -> str:
    if not raw:
        return ""
    trimmed = raw.strip()
    lower = trimmed.lower()
    if re.match(r"^amazon\s*:", trimmed, re.IGNORECASE):
        return "amazon"
    if re.search(r"\bwhole\s*foods\b", lower):
        return "whole foods"
    if re.search(r"\bprime\s+video\b", lower):
        return "prime video"
    if re.search(r"\b(?:amzn|amazon)\b|\bamz\s*\*", lower):
        return "amazon"
    if re.search(r"\bbilt\s+(?:rewards|rent|dining)\b", lower):
        return "bilt"
    if re.search(r"\btarget\b", lower):
        return "target"
    if re.search(r"\bwalmart\b|\bwal-mart\b|\bwm\s+supercenter\b", lower):
        return "walmart"
    if re.search(r"\bcostco\b", lower):
        return "costco"
    if re.search(r"\btrader\s+joe'?s\b", lower):
        return "trader joes"
    if re.search(r"\bstarbucks\b", lower):
        return "starbucks"
    if re.search(r"\bchipotle\b", lower):
        return "chipotle"
    if re.search(r"\buber\s*eats\b", lower):
        return "uber eats"
    if re.search(r"\buber\b", lower):
        return "uber"
    if re.search(r"\blyft\b", lower):
        return "lyft"
    if re.search(r"\bdoordash\b|\bdd\s*\*", lower):
        return "doordash"
    return normalize_merchant_name(raw)


def is_opaque_marketplace(desc: str, merchant: Optional[str] = None) -> bool:
    fam = get_merchant_family(merchant or desc)
    if fam not in MULTI_CATEGORY_MARKETPLACES:
        return False
    trimmed = (desc or "").strip()
    if re.match(r"^[a-z0-9\s]+:\s+\S+", trimmed, re.IGNORECASE):
        return False
    return True


def tokens_match_on_boundaries(norm_a: str, norm_b: str) -> bool:
    shorter = norm_a if len(norm_a) <= len(norm_b) else norm_b
    longer = norm_b if len(norm_a) <= len(norm_b) else norm_a
    if len(shorter) < 4:
        return False
    if re.search(rf"\b{re.escape(shorter)}\b", longer, re.IGNORECASE):
        return True
    stop_tokens = {"payment", "bill", "online", "store", "inc", "llc", "corp", "the"}
    short_tokens = [t for t in shorter.split() if len(t) >= 2 and t not in stop_tokens]
    long_tokens = set(longer.split())
    if short_tokens and any(len(t) >= 4 for t in short_tokens):
        return all(t in long_tokens for t in short_tokens)
    return False


def history_merchants_match(history_desc: str, target_desc: str, target_merchant: Optional[str] = None) -> bool:
    a = normalize_merchant_name(history_desc)
    fam_a = get_merchant_family(history_desc)
    for b_raw in [target_merchant, target_desc]:
        if not b_raw:
            continue
        nb = normalize_merchant_name(b_raw)
        if not a or not nb:
            continue
        if a == nb:
            return True
        fam_b = get_merchant_family(b_raw)
        if fam_a and fam_a == fam_b:
            return True
        first_a = a.split()[0] if a.split() else ""
        first_b = nb.split()[0] if nb.split() else ""
        if a in GENERIC_PAYMENT_RAILS or nb in GENERIC_PAYMENT_RAILS:
            continue
        if first_a in GENERIC_PAYMENT_RAILS or first_b in GENERIC_PAYMENT_RAILS:
            continue
        shorter = a if len(a) <= len(nb) else nb
        if len(shorter.split()) < 2:
            continue
        if tokens_match_on_boundaries(a, nb):
            return True
    return False


def merchants_match(desc_a: str, desc_b: str) -> bool:
    norm_a = normalize_merchant_name(desc_a)
    norm_b = normalize_merchant_name(desc_b)
    if not norm_a or not norm_b:
        return False
    if norm_a == norm_b:
        return True
    fam_a = get_merchant_family(desc_a)
    fam_b = get_merchant_family(desc_b)
    if fam_a and fam_a == fam_b:
        return True
    if norm_a in GENERIC_PAYMENT_RAILS or norm_b in GENERIC_PAYMENT_RAILS:
        return False
    return tokens_match_on_boundaries(norm_a, norm_b)


def parse_iso_date(date_str: str) -> Optional[datetime.date]:
    try:
        return datetime.date.fromisoformat(str(date_str).strip()[:10])
    except ValueError:
        return None


def days_between(date_a: str, date_b: str) -> int:
    da = parse_iso_date(date_a)
    db = parse_iso_date(date_b)
    if not da or not db:
        return 999999
    return abs((da - db).days)


def signed_days_between(date_earlier: str, date_later: str) -> int:
    da = parse_iso_date(date_earlier)
    db = parse_iso_date(date_later)
    if not da or not db:
        return 999999
    return (db - da).days


def extract_account_digits(raw_account: str, rules: Dict[str, Any]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Returns (digits_4, canonical_label, display_name) from an account string, labels, or notes."""
    text = (raw_account or "").strip()
    lower = text.lower()
    account_map = rules.get("accountMap", {})
    # 1. Check explicit 4-digit account numbers first (avoids matching "BILT CARD PMT" on 8885/9666 as 7702)
    for digits, info in account_map.items():
        if re.search(rf"\b{re.escape(digits)}\b", text):
            return digits, info.get("label"), info.get("displayName")
    # 2. Then check canonical account label names
    for digits, info in account_map.items():
        lbl = info.get("label", "").lower()
        if lbl and re.search(rf"\b{re.escape(lbl)}\b", lower):
            return digits, info.get("label"), info.get("displayName")
    m = re.search(r"\b(\d{4})\b", text)
    if m:
        digits = m.group(1)
        info = account_map.get(digits, {})
        return digits, info.get("label", digits), info.get("displayName", text)
    return None, None, None


def row_is_pending(tx: Dict[str, Any]) -> bool:
    meta = tx.get("meta") or {}
    if isinstance(meta.get("provisional"), bool):
        return bool(meta["provisional"])
    notes = (tx.get("notes") or "").lower()
    desc = (tx.get("description") or "").lower()
    return bool(re.search(r"\bpending\b", f"{notes} {desc}"))


def strip_pending_from_notes(notes: str) -> str:
    if not notes:
        return ""
    cleaned = re.sub(r"\s*[•·|-]\s*pending\b", "", notes, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bpending\s*[•·|-]\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\(\s*pending\s*\)", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"^pending$", "", cleaned.strip(), flags=re.IGNORECASE)
    return cleaned.strip()


def resolve_modal_spending_bucket(group: List[Dict[str, Any]], category_id: str) -> str:
    bucket_stats: Dict[str, Dict[str, Any]] = {}
    for tx in group:
        b = tx.get("spendingBucket")
        if b not in ("fixed", "flexible", "non-monthly"):
            continue
        tx_date = str(tx.get("date") or "")
        prev = bucket_stats.get(b)
        if not prev:
            bucket_stats[b] = {"count": 1, "latestDate": tx_date}
        else:
            prev["count"] += 1
            if tx_date > prev["latestDate"]:
                prev["latestDate"] = tx_date

    if bucket_stats:
        best_bucket = max(
            bucket_stats.items(),
            key=lambda kv: (kv[1]["count"], kv[1]["latestDate"]),
        )[0]
        return best_bucket

    return "fixed" if category_id in ("housing", "utilities", "child-care") else "flexible"


def lookup_history_classification(
    description: str,
    merchant: Optional[str],
    existing_txs: List[Dict[str, Any]],
    target_type: str = "expense",
) -> Optional[Dict[str, Any]]:
    if is_opaque_marketplace(description, merchant):
        return None

    candidates: List[Dict[str, Any]] = []
    for tx in existing_txs:
        cat = tx.get("category") or ""
        sub = tx.get("subCategory") or None
        if not cat or cat == "transfers":
            continue
        if tx.get("type") != target_type:
            continue
        if cat == "misc" and (not sub or sub == "misc-other"):
            continue
        labels = tx.get("labels") or []
        if "needs-review" in labels or "refund" in labels:
            continue
        if history_merchants_match(tx.get("description", ""), description, merchant):
            candidates.append(tx)

    if not candidates:
        return None

    counts: Dict[Tuple[str, Optional[str]], List[Dict[str, Any]]] = {}
    for c in candidates:
        key = (c["category"], c.get("subCategory") or None)
        counts.setdefault(key, []).append(c)

    best_key, best_group = max(counts.items(), key=lambda kv: len(kv[1]))
    purity = len(best_group) / len(candidates)
    if purity < 0.6:
        return None

    modal_bucket = None if target_type == "income" else resolve_modal_spending_bucket(best_group, best_key[0])
    return {
        "category": best_key[0],
        "subCategory": best_key[1],
        "spendingBucket": modal_bucket,
        "confidence": min(0.92, 0.78 + purity * 0.14),
        "categorizedBy": "history",
    }


def keyword_matches_text(keyword: str, text_lower: str, word_boundary_set: Set[str]) -> bool:
    kw_lower = keyword.lower().strip()
    if not kw_lower:
        return False
    if kw_lower in word_boundary_set or len(kw_lower) <= 3:
        return bool(re.search(rf"\b{re.escape(kw_lower)}\b", text_lower, re.IGNORECASE))
    return kw_lower in text_lower


def classify_wallet_item(
    raw: Dict[str, Any],
    existing_txs: List[Dict[str, Any]],
    rules: Dict[str, Any],
) -> Dict[str, Any]:
    """Normalizes and classifies a single Google Wallet / Plaid transaction."""
    raw_desc = str(raw.get("description") or raw.get("merchant") or "Transaction").strip()
    raw_merchant = str(raw.get("merchant") or "").strip() or None
    raw_status = str(raw.get("status") or raw.get("type") or "").strip()
    raw_category_hint = str(raw.get("categoryHint") or raw.get("walletCategory") or raw.get("category") or "").strip()
    raw_account = str(raw.get("account") or raw.get("card") or "").strip()
    raw_notes = str(raw.get("notes") or "").strip()

    amt_val = abs(round(float(raw.get("amount", 0.0)), 2))
    is_pending = bool(
        raw.get("pending")
        or raw.get("provisional")
        or "pending" in raw_status.lower()
        or "pending" in raw_notes.lower()
        or bool(re.search(r"\bpending\b", raw_desc.lower()))
    )
    is_refund = bool(
        raw.get("isRefund")
        or "refund" in raw_status.lower()
        or (float(raw.get("amount", 0.0)) < 0 and raw_status.lower() not in ("expense", "purchase", "transfer"))
    )

    acc_digits, acc_label, acc_display = extract_account_digits(raw_account or raw_notes, rules)
    merchant_and_hint = " ".join(filter(None, [raw_desc, raw_merchant, raw_category_hint]))
    combined_text = " ".join(filter(None, [raw_desc, raw_merchant, raw_category_hint, raw_notes]))

    # Build provenance note if not explicitly provided
    provenance_parts = ["Google Wallet (Plaid)"]
    if acc_display:
        provenance_parts.append(acc_display)
    if is_pending:
        provenance_parts.append("Pending")

    # 1. Check Bilt Housing Pass-Through Rules
    for b_rule in rules.get("biltHousingRules", []):
        if re.search(b_rule["pattern"], raw_desc, re.IGNORECASE) or re.search(
            b_rule["pattern"], combined_text, re.IGNORECASE
        ):
            req_acc = b_rule.get("account")
            if not req_acc or not acc_digits or req_acc == acc_digits:
                final_desc = b_rule.get("description") or raw_desc
                if b_rule.get("preserveRawInNotes") and raw_desc.lower() != final_desc.lower():
                    provenance_parts.append(raw_desc)
                notes_out = raw_notes or " • ".join(provenance_parts)
                if is_pending and "pending" not in notes_out.lower():
                    notes_out = f"{notes_out} • Pending"
                tx_type = b_rule["type"]
                bucket = b_rule.get("spendingBucket")
                labels: List[str] = []
                return {
                    "description": final_desc,
                    "amount": amt_val,
                    "type": tx_type,
                    "category": b_rule["category"],
                    "subCategory": b_rule.get("subCategory"),
                    "spendingBucket": bucket,
                    "labels": labels,
                    "notes": notes_out,
                    "account": acc_label,
                    "provisional": is_pending,
                    "confidence": 0.96,
                    "categorizedBy": "keyword",
                    "reviewReason": None,
                    "reviewDetail": None,
                    "normalizeMonthEndToFirstOfNextMonth": bool(
                        b_rule.get("normalizeMonthEndToFirstOfNextMonth")
                    ),
                    "minAmount": float(b_rule.get("minAmount") or 0.0),
                }

    # 2. Check Credit Card Bill Payoffs (Transfer) — isolated from free-text `raw_notes`
    if raw_status.lower() == "transfer" or any(
        re.search(pat, raw_desc, re.IGNORECASE) or re.search(pat, merchant_and_hint, re.IGNORECASE)
        for pat in rules.get("creditCardPayoffPatterns", [])
    ):
        notes_out = raw_notes or " • ".join(provenance_parts)
        labels = []
        return {
            "description": raw_desc,
            "amount": amt_val,
            "type": "transfer",
            "category": "transfers",
            "subCategory": "transfers-cc",
            "spendingBucket": None,
            "labels": labels,
            "notes": notes_out,
            "account": acc_label,
            "provisional": is_pending,
            "confidence": 0.98,
            "categorizedBy": "keyword",
            "reviewReason": None,
            "reviewDetail": None,
        }

    # 3. Determine Income vs Expense vs Refund
    is_pure_income = (
        not is_refund
        and (
            raw_status.lower() in ("income", "deposit", "credit", "payroll")
            or raw_category_hint.lower() == "income"
            or bool(re.search(r"\b(?:payroll|direct\s+deposit|your\s+rental|rental\s+income)\b", combined_text, re.IGNORECASE))
        )
    )
    tx_type = "income" if (is_pure_income or is_refund) else "expense"

    # 4. Stage 1: Ledger History Memory (runs BEFORE Stage 2 rules so user-verified categories win)
    hist = lookup_history_classification(
        raw_desc,
        raw_merchant,
        existing_txs,
        target_type="income" if is_pure_income else "expense",
    )
    if not hist and not is_refund and not raw_status:
        inc_hist = lookup_history_classification(
            raw_desc,
            raw_merchant,
            existing_txs,
            target_type="income",
        )
        if inc_hist and inc_hist.get("category") == "income":
            hist = inc_hist
            tx_type = "income"
            is_pure_income = True

    if hist:
        bucket = hist["spendingBucket"] if (tx_type == "expense" or is_refund) else None
        labels = ["refund"] if is_refund else []
        notes_out = raw_notes or " • ".join(provenance_parts)
        return {
            "description": raw_desc,
            "amount": amt_val,
            "type": tx_type,
            "category": hist["category"],
            "subCategory": hist["subCategory"],
            "spendingBucket": bucket,
            "labels": labels,
            "notes": notes_out,
            "account": acc_label,
            "provisional": is_pending,
            "confidence": hist["confidence"],
            "categorizedBy": "history",
            "reviewReason": None,
            "reviewDetail": None,
        }

    # 5. Stage 2a: Known Recurring ACH / Merchant Rules
    for k_rule in rules.get("knownRecurringRules", []):
        if re.search(k_rule["pattern"], raw_desc, re.IGNORECASE) or re.search(
            k_rule["pattern"], combined_text, re.IGNORECASE
        ):
            if k_rule.get("requireIncomeContext") and not is_pure_income:
                continue
            resolved_type = "income" if is_refund else k_rule["type"]
            bucket = k_rule.get("spendingBucket") if (resolved_type == "expense" or is_refund) else None
            labels = ["refund"] if is_refund else []
            notes_out = raw_notes or " • ".join(provenance_parts)
            return {
                "description": raw_desc,
                "amount": amt_val,
                "type": resolved_type,
                "category": k_rule["category"],
                "subCategory": k_rule.get("subCategory"),
                "spendingBucket": bucket,
                "labels": labels,
                "notes": notes_out,
                "account": acc_label,
                "provisional": is_pending,
                "confidence": k_rule.get("confidence", 0.95),
                "categorizedBy": "keyword",
                "reviewReason": None,
                "reviewDetail": None,
            }

    # 6. Stage 2b: Keyword & Category-Hint Rules (with word-boundary protection for short tokens)
    norm_combined = combined_text.lower()
    wb_set = {w.lower() for w in rules.get("wordBoundaryKeywords", DEFAULT_WORD_BOUNDARY_KEYWORDS)}
    cat_kw_entries = rules.get("categoryKeywords", DEFAULT_CATEGORY_KEYWORDS)

    for entry in cat_kw_entries:
        cat_id = entry["category"]
        sub_id = entry.get("subCategory")
        default_bucket = entry.get("spendingBucket", "flexible")
        kw_list = entry.get("keywords", [])
        if any(keyword_matches_text(kw, norm_combined, wb_set) for kw in kw_list):
            opaque = is_opaque_marketplace(raw_desc, raw_merchant) and not is_refund
            conf = 0.55 if opaque else 0.85
            rev_reason = "category" if opaque else None
            rev_detail = (
                "Un-itemized marketplace charge; category may need item enrichment or review."
                if opaque
                else None
            )
            bucket = default_bucket if (tx_type == "expense" or is_refund) else None
            labels = [
                l
                for l in [
                    ("refund" if is_refund else None),
                    ("needs-review" if rev_reason else None),
                ]
                if l
            ]
            notes_out = raw_notes or " • ".join(provenance_parts)
            return {
                "description": raw_desc,
                "amount": amt_val,
                "type": tx_type,
                "category": cat_id,
                "subCategory": sub_id,
                "spendingBucket": bucket,
                "labels": labels,
                "notes": notes_out,
                "account": acc_label,
                "provisional": is_pending,
                "confidence": conf,
                "categorizedBy": "keyword",
                "reviewReason": rev_reason,
                "reviewDetail": rev_detail,
            }

    # 7. Graceful Fallback -> 'misc / misc-other' (or 'income / income-other') + flag for review
    fallback_cat = "income" if is_pure_income else "misc"
    fallback_sub = "income-other" if is_pure_income else "misc-other"
    bucket = "flexible" if (tx_type == "expense" or is_refund) else None
    labels = [l for l in [("refund" if is_refund else None), "needs-review"] if l]
    notes_out = raw_notes or " • ".join(provenance_parts)
    return {
        "description": raw_desc,
        "amount": amt_val,
        "type": tx_type,
        "category": fallback_cat,
        "subCategory": fallback_sub,
        "spendingBucket": bucket,
        "labels": labels,
        "notes": notes_out,
        "account": acc_label,
        "provisional": is_pending,
        "confidence": 0.35,
        "categorizedBy": "fallback",
        "reviewReason": "category",
        "reviewDetail": "Unrecognized merchant or description; assigned to Miscellaneous for review.",
    }


def sanitize_sheet_cell(val: Any) -> str:
    if val is None:
        return ""
    return re.sub(r"[\r\n\t]+", " ", str(val)).strip()


def tx_to_sheet_row(tx: Dict[str, Any]) -> List[Any]:
    """Serializes a Transaction dict to the canonical 12-column (`Transactions!A:L`) row."""
    labels_json = json.dumps(tx.get("labels") or [], ensure_ascii=False)
    meta_json = json.dumps(tx.get("meta") or {}, ensure_ascii=False, separators=(",", ":"))
    return [
        sanitize_sheet_cell(tx["id"]),
        sanitize_sheet_cell(tx["date"]),
        sanitize_sheet_cell(tx["category"]),
        sanitize_sheet_cell(tx.get("subCategory") or ""),
        tx["amount"],
        sanitize_sheet_cell(tx["type"]),
        sanitize_sheet_cell(tx["description"]),
        sanitize_sheet_cell(tx.get("notes") or ""),
        labels_json,
        sanitize_sheet_cell(tx.get("hash") or ""),
        sanitize_sheet_cell(tx.get("spendingBucket") or ""),
        meta_json,
    ]


def parse_sheet_row_dict(
    row_dict: Dict[str, str],
    row_number: int,
    rules: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    raw_id = (row_dict.get("id") or "").strip()
    raw_date = (row_dict.get("date") or "").strip()[:10]
    raw_desc = (row_dict.get("description") or "").strip()
    raw_amt = (row_dict.get("amount") or "").strip()
    if not raw_id and not raw_date and not raw_desc and not raw_amt:
        return None

    labels_raw = row_dict.get("labels") or "[]"
    try:
        labels = json.loads(labels_raw) if labels_raw.strip() else []
    except Exception:
        labels = []
    meta_raw = row_dict.get("meta") or ""
    try:
        meta = json.loads(meta_raw) if meta_raw.strip() else {}
    except Exception:
        meta = {}
    raw_user_edited = meta.get("userEdited")
    user_edited_fields = raw_user_edited if isinstance(raw_user_edited, list) else []
    if not meta.get("account") and "account" not in user_edited_fields:
        _, acc_label, _ = extract_account_digits(
            " ".join(labels) or row_dict.get("notes") or "",
            rules,
        )
        if acc_label:
            meta["account"] = acc_label
    try:
        amt_float = round(float(raw_amt.replace("$", "").replace(",", "") or 0.0), 2)
    except Exception:
        amt_float = 0.0

    return {
        "rowNumber": row_number,
        "id": raw_id or str(uuid.uuid4()),
        "date": raw_date,
        "category": (row_dict.get("category") or "misc").strip(),
        "subCategory": (row_dict.get("subCategory") or "").strip() or None,
        "amount": amt_float,
        "type": (row_dict.get("type") or "expense").strip(),
        "description": raw_desc,
        "notes": row_dict.get("notes") or "",
        "labels": labels,
        "hash": (row_dict.get("hash") or "").strip(),
        "spendingBucket": (row_dict.get("spendingBucket") or "").strip() or None,
        "meta": meta,
    }


def load_transactions_tsv(tsv_path: str, rules: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Loads Transactions.tsv using line-accurate `csv.reader` so blank rows never shift `rowNumber`."""
    rows: List[Dict[str, Any]] = []
    with open(tsv_path, "r", encoding="utf-8") as f:
        reader = csv.reader(f, delimiter="\t")
        header: Optional[List[str]] = None
        for row_idx, raw_cells in enumerate(reader, start=1):
            if row_idx == 1:
                header = [c.strip() for c in raw_cells]
                continue
            if not raw_cells or all(not c.strip() for c in raw_cells):
                continue
            if not header:
                continue
            row_dict = {
                header[i]: (raw_cells[i] if i < len(raw_cells) else "")
                for i in range(len(header))
            }
            parsed = parse_sheet_row_dict(row_dict, row_idx, rules)
            if parsed:
                rows.append(parsed)
    return rows


def load_transactions_json(json_path: str, rules: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Loads a 2D JSON grid from `gsheets readonly read <ID> 'Transactions!A1:L2000' --json`."""
    rows: List[Dict[str, Any]] = []
    with open(json_path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    grid = payload.get("values", payload) if isinstance(payload, dict) else payload
    if not isinstance(grid, list) or not grid:
        return rows
    header = [str(c).strip() for c in grid[0]]
    for row_idx, raw_cells in enumerate(grid[1:], start=2):
        if not isinstance(raw_cells, list) or all(not str(c).strip() for c in raw_cells):
            continue
        row_dict = {
            header[i]: (str(raw_cells[i]) if i < len(raw_cells) and raw_cells[i] is not None else "")
            for i in range(len(header))
        }
        parsed = parse_sheet_row_dict(row_dict, row_idx, rules)
        if parsed:
            rows.append(parsed)
    return rows


def load_ingest_state_from_notes(
    notes_json_path: Optional[str],
    now_iso: Optional[str] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Loads IngestState and row metadata from `Notes!A1:B50` JSON.
    Returns `(ingest_state, notes_meta)` where `notes_meta` tracks:
      - `stateRow`: first row index containing `__meta_ingest_state__`
      - `duplicateStateRows`: any duplicate `__meta_ingest_state__` row indices to clear
      - `overflowRowMap`: `{chunk_idx: row_num}` for `__meta_ingest_tombstones_1__..5__`
      - `activeLock`: active lease lock dict if `__meta_ingest_lock__` is unexpired
    """
    default_state: Dict[str, Any] = {
        "version": 1,
        "tombstones": [],
        "sources": {},
        "recentRuns": [],
    }
    notes_meta: Dict[str, Any] = {
        "stateRow": None,
        "duplicateStateRows": [],
        "overflowRowMap": {},
        "activeLock": None,
    }
    if not notes_json_path or not os.path.exists(notes_json_path):
        return default_state, notes_meta

    with open(notes_json_path, "r", encoding="utf-8") as f:
        raw_payload = json.load(f)

    grid = raw_payload.get("values", raw_payload) if isinstance(raw_payload, dict) else raw_payload
    if not isinstance(grid, list):
        return default_state, notes_meta

    now_dt = (
        datetime.datetime.fromisoformat(now_iso.replace("Z", "+00:00"))
        if now_iso
        else datetime.datetime.now(datetime.timezone.utc)
    )

    overflow_chunks: Dict[int, List[str]] = {}
    for idx, row in enumerate(grid, start=1):
        if not row or len(row) < 2:
            continue
        key = str(row[0]).strip()
        val_str = str(row[1]).strip()
        if key == "__meta_ingest_state__":
            if notes_meta["stateRow"] is None:
                notes_meta["stateRow"] = idx
                try:
                    wrapper = json.loads(val_str)
                    inner = (
                        json.loads(wrapper["text"])
                        if isinstance(wrapper, dict) and "text" in wrapper
                        else wrapper
                    )
                    if isinstance(inner, dict):
                        default_state.update(inner)
                except Exception:
                    pass
            else:
                notes_meta["duplicateStateRows"].append(idx)
        elif key.startswith("__meta_ingest_tombstones_"):
            try:
                chunk_idx = int(key.replace("__meta_ingest_tombstones_", "").replace("__", ""))
                notes_meta["overflowRowMap"][chunk_idx] = idx
                wrapper = json.loads(val_str)
                inner = (
                    json.loads(wrapper["text"])
                    if isinstance(wrapper, dict) and "text" in wrapper
                    else wrapper
                )
                if isinstance(inner, list):
                    overflow_chunks[chunk_idx] = [str(x) for x in inner]
            except Exception:
                pass
        elif key == "__meta_ingest_lock__" and val_str:
            try:
                wrapper = json.loads(val_str)
                inner = (
                    json.loads(wrapper["text"])
                    if isinstance(wrapper, dict) and "text" in wrapper
                    else wrapper
                )
                if isinstance(inner, dict) and inner.get("expiresAt"):
                    exp_dt = datetime.datetime.fromisoformat(
                        str(inner["expiresAt"]).replace("Z", "+00:00")
                    )
                    if exp_dt > now_dt:
                        notes_meta["activeLock"] = inner
            except Exception:
                pass

    combined_tombstones = list(default_state.get("tombstones") or [])
    for c_idx in sorted(overflow_chunks.keys()):
        combined_tombstones.extend(overflow_chunks[c_idx])
    default_state["tombstones"] = list(dict.fromkeys(combined_tombstones))[-MAX_TOTAL_TOMBSTONES:]

    return default_state, notes_meta


def reconcile_wallet_batch(
    existing_txs: List[Dict[str, Any]],
    incoming_raw: List[Dict[str, Any]],
    ingest_state: Dict[str, Any],
    rules: Dict[str, Any],
    reference_date: Optional[str] = None,
    lookback_days: Optional[int] = None,
    now_iso: Optional[str] = None,
) -> Dict[str, Any]:
    now_str = now_iso or datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    ref_date_str = reference_date or now_str[:10]
    lb_days = lookback_days if lookback_days is not None else int(rules.get("lookbackDays", 7))
    sheet_window_days = int(rules.get("sheetWindowDays", 14))
    source_id = rules.get("sourceId", "gpay-plaid")

    ref_date = parse_iso_date(ref_date_str)
    cutoff_date = (ref_date - datetime.timedelta(days=lb_days)).isoformat() if ref_date and lb_days > 0 else None

    tombstone_list: List[str] = list(dict.fromkeys(ingest_state.get("tombstones") or []))
    tombstones: Set[str] = set(tombstone_list)

    summary = {
        "totalInput": len(incoming_raw),
        "inserted": 0,
        "insertedFlagged": 0,
        "updatedPendingToSettled": 0,
        "mergedTipAdjusted": 0,
        "skippedDuplicate": 0,
        "skippedTombstoned": 0,
        "skippedBeforeLookback": 0,
    }

    append_rows: List[List[Any]] = []
    inserted_txs: List[Dict[str, Any]] = []
    update_ops: List[Dict[str, Any]] = []
    flagged_txs: List[Dict[str, Any]] = []
    records: List[Dict[str, Any]] = []

    working_ledger = [
        dict(t, labels=list(t.get("labels") or []), meta=dict(t.get("meta") or {}))
        for t in existing_txs
    ]
    claimed_existing_ids: Set[str] = set()
    created_in_batch_ids: Set[str] = set()

    for idx, raw in enumerate(incoming_raw):
        raw_date = str(raw.get("date") or "").strip()[:10]
        classified = classify_wallet_item(raw, working_ledger, rules)

        # Month-end Bilt housing date normalization (days 28..31 and amount >= minAmount -> 1st of next month)
        tx_date = raw_date
        if classified.get("normalizeMonthEndToFirstOfNextMonth") and classified["amount"] >= float(
            classified.get("minAmount") or 1000.0
        ):
            d_obj = parse_iso_date(raw_date)
            if d_obj and d_obj.day >= 28:
                next_year = d_obj.year + (1 if d_obj.month == 12 else 0)
                next_month = 1 if d_obj.month == 12 else d_obj.month + 1
                tx_date = datetime.date(next_year, next_month, 1).isoformat()
                posted_tag = f"Posted {raw_date}"
                if posted_tag.lower() not in (classified.get("notes") or "").lower():
                    classified["notes"] = (
                        f"{classified['notes']} • {posted_tag}"
                        if classified.get("notes")
                        else posted_tag
                    )

        # Check lookback cutoff AFTER month-end normalization
        if cutoff_date and tx_date < cutoff_date:
            summary["skippedBeforeLookback"] += 1
            records.append({"inputIndex": idx, "status": "skipped_before_lookback", "date": tx_date})
            continue

        tx_hash = compute_tx_hash(
            tx_date,
            classified["description"],
            classified["amount"],
            classified["type"],
        )
        raw_hash = compute_tx_hash(
            raw_date,
            classified["description"],
            classified["amount"],
            classified["type"],
        )
        short_h = tx_hash[:16]
        raw_short_h = raw_hash[:16]
        candidate_hashes = {tx_hash, raw_hash}
        candidate_short_hashes = {short_h, raw_short_h}
        ext_id = str(raw.get("externalId") or "").strip() or None

        # 1. Check Tombstones (against both normalized and raw hashes)
        if (
            (ext_id and ext_id in tombstones)
            or bool(candidate_short_hashes & tombstones)
            or bool(candidate_hashes & tombstones)
        ):
            summary["skippedTombstoned"] += 1
            records.append({"inputIndex": idx, "status": "skipped_tombstoned", "hash": tx_hash})
            continue

        # 2. Check Exact Hash or Alias Hash Match (Unclaimed existing rows first)
        exact_match = next(
            (
                t
                for t in working_ledger
                if t["id"] not in created_in_batch_ids
                and t["id"] not in claimed_existing_ids
                and (
                    t.get("hash") in candidate_hashes
                    or bool(candidate_short_hashes & set(t.get("meta", {}).get("aliasHashes") or []))
                )
            ),
            None,
        )
        if exact_match:
            claimed_existing_ids.add(exact_match["id"])
            if row_is_pending(exact_match) and not classified["provisional"]:
                user_edited = set(exact_match.get("meta", {}).get("userEdited") or [])
                if "notes" not in user_edited:
                    exact_match["notes"] = (
                        strip_pending_from_notes(exact_match.get("notes") or "")
                        or strip_pending_from_notes(classified.get("notes") or "")
                    )
                if (
                    "description" not in user_edited
                    and re.search(r"\bpending\b", exact_match.get("description") or "", re.IGNORECASE)
                    and not re.search(r"\bpending\b", classified["description"], re.IGNORECASE)
                ):
                    exact_match["description"] = classified["description"]
                    exact_match["hash"] = compute_tx_hash(
                        exact_match["date"],
                        exact_match["description"],
                        exact_match["amount"],
                        exact_match["type"],
                    )
                meta = dict(exact_match.get("meta") or {})
                meta["provisional"] = False
                meta["updatedAt"] = now_str
                meta["aliasHashes"] = list(
                    dict.fromkeys([*(meta.get("aliasHashes") or []), short_h, raw_short_h])
                )
                if source_id not in (meta.get("sources") or []):
                    meta["sources"] = list(dict.fromkeys([*(meta.get("sources") or []), source_id]))
                exact_match["meta"] = meta
                row_vals = tx_to_sheet_row(exact_match)
                update_ops.append(
                    {
                        "rowNumber": exact_match.get("rowNumber"),
                        "id": exact_match["id"],
                        "status": "updated_pending_to_settled",
                        "tx": exact_match,
                        "row": row_vals,
                    }
                )
                summary["updatedPendingToSettled"] += 1
                records.append({"inputIndex": idx, "status": "updated_pending_to_settled", "id": exact_match["id"]})
                continue

            summary["skippedDuplicate"] += 1
            records.append({"inputIndex": idx, "status": "skipped_exact_duplicate", "id": exact_match["id"]})
            continue

        # 2b. Check if an identical hash was already claimed or created in this batch (2nd identical charge)
        claimed_or_batch_exact = next(
            (
                t
                for t in working_ledger
                if (t["id"] in created_in_batch_ids or t["id"] in claimed_existing_ids)
                and (
                    t.get("hash") in candidate_hashes
                    or bool(candidate_short_hashes & set(t.get("meta", {}).get("aliasHashes") or []))
                )
            ),
            None,
        )
        if claimed_or_batch_exact and not ext_id:
            classified["reviewReason"] = "duplicate"
            classified["reviewDetail"] = (
                f"Same-day identical charge (${classified['amount']:.2f} at {classified['description']}); "
                "verify not a duplicate."
            )
            if "needs-review" not in classified["labels"]:
                classified["labels"].append("needs-review")

        # 3. Check Pending -> Settled Upgrade with ±3d Settlement Date Drift (within 14d window)
        if not classified["provisional"] and not claimed_or_batch_exact:
            pending_candidates = [
                t
                for t in working_ledger
                if t["id"] not in created_in_batch_ids
                and t["id"] not in claimed_existing_ids
                and row_is_pending(t)
                and days_between(t["date"], ref_date_str) <= sheet_window_days
                and days_between(t["date"], tx_date) <= 3
                and t["type"] == classified["type"]
                and abs(t["amount"] - classified["amount"]) <= 0.01
                and (
                    not t.get("meta", {}).get("account")
                    or not classified["account"]
                    or t["meta"]["account"] == classified["account"]
                )
                and (
                    merchants_match(t["description"], classified["description"])
                    or (
                        t["type"] == "transfer"
                        and classified["type"] == "transfer"
                        and t.get("subCategory") == "transfers-cc"
                        and classified.get("subCategory") == "transfers-cc"
                    )
                )
            ]
            pending_candidates.sort(key=lambda t: days_between(t["date"], tx_date))

            if len(pending_candidates) >= 1:
                target = pending_candidates[0]
                claimed_existing_ids.add(target["id"])
                old_short = (target.get("hash") or "")[:16]
                user_edited = set(target.get("meta", {}).get("userEdited") or [])
                if "date" not in user_edited:
                    target["date"] = tx_date
                if (
                    "description" not in user_edited
                    and re.search(r"\bpending\b", target.get("description") or "", re.IGNORECASE)
                    and not re.search(r"\bpending\b", classified["description"], re.IGNORECASE)
                ):
                    target["description"] = classified["description"]
                if "notes" not in user_edited:
                    target["notes"] = (
                        strip_pending_from_notes(target.get("notes") or "")
                        or strip_pending_from_notes(classified.get("notes") or "")
                    )
                target["hash"] = compute_tx_hash(
                    target["date"], target["description"], target["amount"], target["type"]
                )
                new_short = target["hash"][:16]
                meta = dict(target.get("meta") or {})
                aliases = list(
                    dict.fromkeys(
                        [
                            *(meta.get("aliasHashes") or []),
                            *([old_short] if old_short else []),
                            short_h,
                            raw_short_h,
                            new_short,
                        ]
                    )
                )
                meta["aliasHashes"] = aliases
                meta["provisional"] = False
                meta["updatedAt"] = now_str
                target["meta"] = meta
                row_vals = tx_to_sheet_row(target)
                update_ops.append(
                    {
                        "rowNumber": target.get("rowNumber"),
                        "id": target["id"],
                        "status": "updated_pending_to_settled",
                        "tx": target,
                        "row": row_vals,
                    }
                )
                summary["updatedPendingToSettled"] += 1
                records.append({"inputIndex": idx, "status": "updated_pending_to_settled", "id": target["id"]})
                continue

            # 4. Check Restaurant Tip Drift (+0..3d, +1%..35% tip on Pending expense rows)
            if classified["type"] == "expense":
                tip_candidates = []
                for t in working_ledger:
                    if t["id"] in created_in_batch_ids or t["id"] in claimed_existing_ids:
                        continue
                    if not row_is_pending(t) or t["type"] != "expense":
                        continue
                    delta_d = signed_days_between(t["date"], tx_date)
                    if delta_d < 0 or delta_d > 3:
                        continue
                    if (
                        t.get("meta", {}).get("account")
                        and classified["account"]
                        and t["meta"]["account"] != classified["account"]
                    ):
                        continue
                    if not merchants_match(t["description"], classified["description"]):
                        continue
                    tip_delta = classified["amount"] - t["amount"]
                    min_tip = max(1.0, t["amount"] * 0.01)
                    max_tip = max(5.0, t["amount"] * 0.35)
                    if min_tip - 0.005 <= tip_delta <= max_tip + 0.005:
                        tip_candidates.append(t)

                tip_candidates.sort(key=lambda t: days_between(t["date"], tx_date))
                if len(tip_candidates) >= 1:
                    target = tip_candidates[0]
                    claimed_existing_ids.add(target["id"])
                    old_short = (target.get("hash") or "")[:16]
                    user_edited = set(target.get("meta", {}).get("userEdited") or [])
                    if "date" not in user_edited:
                        target["date"] = tx_date
                    if "amount" not in user_edited:
                        target["amount"] = classified["amount"]
                    if "notes" not in user_edited:
                        target["notes"] = (
                            strip_pending_from_notes(target.get("notes") or "")
                            or strip_pending_from_notes(classified.get("notes") or "")
                        )
                    target["hash"] = compute_tx_hash(
                        target["date"], target["description"], target["amount"], target["type"]
                    )
                    new_short = target["hash"][:16]
                    meta = dict(target.get("meta") or {})
                    aliases = list(
                        dict.fromkeys(
                            [
                                *(meta.get("aliasHashes") or []),
                                *([old_short] if old_short else []),
                                short_h,
                                new_short,
                            ]
                        )
                    )
                    meta["aliasHashes"] = aliases
                    meta["provisional"] = False
                    meta["updatedAt"] = now_str
                    target["meta"] = meta
                    row_vals = tx_to_sheet_row(target)
                    update_ops.append(
                        {
                            "rowNumber": target.get("rowNumber"),
                            "id": target["id"],
                            "status": "merged_tip_adjusted",
                            "tx": target,
                            "row": row_vals,
                        }
                    )
                    summary["mergedTipAdjusted"] += 1
                    records.append({"inputIndex": idx, "status": "merged_tip_adjusted", "id": target["id"]})
                    continue

        # 4b. Check Ambiguous Duplicate Collision (±2d same merchant + amount + type + compatible account)
        if not classified.get("reviewReason"):
            collision = next(
                (
                    t
                    for t in working_ledger
                    if t["type"] == classified["type"]
                    and abs(t["amount"] - classified["amount"]) <= 0.01
                    and days_between(t["date"], tx_date) <= 2
                    and (
                        not t.get("meta", {}).get("account")
                        or not classified["account"]
                        or t["meta"]["account"] == classified["account"]
                    )
                    and merchants_match(t["description"], classified["description"])
                ),
                None,
            )
            if collision:
                classified["reviewReason"] = "duplicate"
                classified["reviewDetail"] = (
                    f'Same merchant and amount (${classified["amount"]:.2f}) within '
                    f'{days_between(collision["date"], tx_date)}d of "{collision["description"]}"; '
                    "verify not a duplicate."
                )
                if "needs-review" not in classified["labels"]:
                    classified["labels"].append("needs-review")

        # 5. Insert New Transaction
        new_id = str(raw.get("id") or uuid.uuid4())
        review_obj = None
        if classified["reviewReason"]:
            review_obj = {
                "reason": classified["reviewReason"],
                "reasons": [classified["reviewReason"]],
                "detail": classified["reviewDetail"],
                "flaggedAt": now_str,
            }
        alias_hashes = list(dict.fromkeys([short_h, raw_short_h]))
        meta_obj: Dict[str, Any] = {
            "sources": [source_id],
            "aliasHashes": alias_hashes,
            "confidence": classified["confidence"],
            "categorizedBy": classified["categorizedBy"],
            "ingestedAt": now_str,
            "updatedAt": now_str,
        }
        if ext_id:
            meta_obj["externalIds"] = {source_id: ext_id}
        if classified["account"]:
            meta_obj["account"] = classified["account"]
        if classified["provisional"]:
            meta_obj["provisional"] = True
        if review_obj:
            meta_obj["review"] = review_obj

        new_tx: Dict[str, Any] = {
            "id": new_id,
            "date": tx_date,
            "category": classified["category"],
            "subCategory": classified["subCategory"],
            "amount": classified["amount"],
            "type": classified["type"],
            "description": classified["description"],
            "notes": classified["notes"],
            "labels": classified["labels"],
            "hash": tx_hash,
            "spendingBucket": classified["spendingBucket"],
            "meta": meta_obj,
        }
        working_ledger.append(new_tx)
        created_in_batch_ids.add(new_id)
        inserted_txs.append(new_tx)
        append_rows.append(tx_to_sheet_row(new_tx))

        if "needs-review" in new_tx["labels"]:
            summary["insertedFlagged"] += 1
            flagged_txs.append(new_tx)
            records.append(
                {
                    "inputIndex": idx,
                    "status": "inserted_flagged",
                    "id": new_id,
                    "reviewReason": classified["reviewReason"],
                    "tx": new_tx,
                }
            )
        else:
            summary["inserted"] += 1
            records.append({"inputIndex": idx, "status": "inserted", "id": new_id, "tx": new_tx})

    # Update IngestState (preserve deterministic tombstone order up to 2000 items)
    prev_sources = dict(ingest_state.get("sources") or {})
    prev_src = dict(prev_sources.get(source_id) or {})
    next_src_state: Dict[str, Any] = {
        "sourceId": source_id,
        "lastSyncAt": now_str,
        "totalIngested": int(prev_src.get("totalIngested") or 0)
        + summary["inserted"]
        + summary["insertedFlagged"]
        + summary["updatedPendingToSettled"]
        + summary["mergedTipAdjusted"],
    }
    if prev_src.get("syncStartDate"):
        next_src_state["syncStartDate"] = prev_src["syncStartDate"]
    prev_sources[source_id] = next_src_state

    recent_runs = list(ingest_state.get("recentRuns") or [])[-19:]
    recent_runs.append(
        {
            "runId": f"run-{int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)}",
            "sourceId": source_id,
            "timestamp": now_str,
            "inserted": summary["inserted"],
            "flagged": summary["insertedFlagged"],
            "merged": summary["mergedTipAdjusted"],
            "updated": summary["updatedPendingToSettled"],
            "removed": 0,
            "skipped": summary["skippedDuplicate"]
            + summary["skippedTombstoned"]
            + summary["skippedBeforeLookback"],
        }
    )

    ordered_tombstones = tombstone_list[-MAX_TOTAL_TOMBSTONES:]
    next_ingest_state = {
        "version": 1,
        "tombstones": ordered_tombstones,
        "sources": prev_sources,
        "recentRuns": recent_runs,
    }

    return {
        "summary": summary,
        "appendRows": append_rows,
        "insertedTransactions": inserted_txs,
        "updateOps": update_ops,
        "flaggedTransactions": flagged_txs,
        "nextIngestState": next_ingest_state,
        "records": records,
    }


def format_digest_markdown(plan: Dict[str, Any]) -> str:
    s = plan["summary"]
    lines = [
        "### 🌅 Nebula Expense — Morning Wallet Sync Digest",
        "",
        "| Metric | Count |",
        "| :--- | ---: |",
        f"| Total Incoming Examined | {s['totalInput']} |",
        f"| Inserted (Clean) | {s['inserted']} |",
        f"| Inserted (`needs-review`) | {s['insertedFlagged']} |",
        f"| Upgraded Pending -> Settled | {s['updatedPendingToSettled']} |",
        f"| Restaurant Tip Adjusted | {s['mergedTipAdjusted']} |",
        f"| Skipped (Duplicate / Tombstoned) | {s['skippedDuplicate'] + s['skippedTombstoned']} |",
    ]
    if plan["insertedTransactions"]:
        lines.extend(
            [
                "",
                "#### ➕ Newly Ingested Transactions",
                "| Date | Description | Amount | Type | Category | Account | Flags / Tags |",
                "| :--- | :--- | ---: | :--- | :--- | :--- | :--- |",
            ]
        )
        for tx in plan["insertedTransactions"]:
            cat_str = f"{tx['category']}/{tx['subCategory']}" if tx.get("subCategory") else tx["category"]
            acc_str = (tx.get("meta") or {}).get("account") or "—"
            lbl_str = ", ".join(tx.get("labels") or []) or "—"
            lines.append(
                f"| {tx['date']} | {tx['description']} | ${tx['amount']:.2f} | {tx['type']} | `{cat_str}` | {acc_str} | {lbl_str} |"
            )

    if plan["updateOps"]:
        lines.extend(
            [
                "",
                "#### 🔄 Updated In-Place (Pending -> Settled / Tip Drift)",
                "| Row | Date | Description | Amount | Status |",
                "| ---: | :--- | :--- | ---: | :--- |",
            ]
        )
        for op in plan["updateOps"]:
            tx = op["tx"]
            lines.append(
                f"| {op.get('rowNumber') or '-'} | {tx['date']} | {tx['description']} | ${tx['amount']:.2f} | `{op['status']}` |"
            )

    if plan["flaggedTransactions"]:
        lines.extend(
            [
                "",
                "#### ⚠️ Needs Review Queue",
                "| Date | Description | Amount | Best-Guess Category | Reason |",
                "| :--- | :--- | ---: | :--- | :--- |",
            ]
        )
        for tx in plan["flaggedTransactions"]:
            rev = (tx.get("meta") or {}).get("review") or {}
            cat_str = f"{tx['category']}/{tx['subCategory']}" if tx.get("subCategory") else tx["category"]
            lines.append(
                f"| {tx['date']} | {tx['description']} | ${tx['amount']:.2f} | `{cat_str}` | {rev.get('detail') or rev.get('reason') or 'category'} |"
            )
    return "\n".join(lines)


def build_gsheets_batch_requests(
    plan: Dict[str, Any],
    notes_meta: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    meta_info = notes_meta or {}
    notes_state_row: Optional[int] = meta_info.get("stateRow")
    duplicate_state_rows: List[int] = meta_info.get("duplicateStateRows") or []
    overflow_row_map: Dict[int, int] = meta_info.get("overflowRowMap") or {}

    batch: List[Dict[str, Any]] = []
    for op in plan["updateOps"]:
        row_num = op.get("rowNumber")
        if row_num:
            batch.append(
                {
                    "op": "write",
                    "range": f"Transactions!A{row_num}:L{row_num}",
                    "data": [op["row"]],
                }
            )
    if plan["appendRows"]:
        batch.append(
            {
                "op": "append",
                "range": "Transactions!A1",
                "data": plan["appendRows"],
            }
        )

    now_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    full_state = dict(plan["nextIngestState"])
    all_tombstones = list(full_state.get("tombstones") or [])[-MAX_TOTAL_TOMBSTONES:]
    inline_tombstones = all_tombstones[:MAX_INLINE_TOMBSTONES]
    overflow_tombstones = all_tombstones[MAX_INLINE_TOMBSTONES:]

    inline_state = dict(full_state, tombstones=inline_tombstones)
    note_cell = json.dumps(
        {
            "text": json.dumps(inline_state, separators=(",", ":")),
            "updatedAt": now_str,
        },
        separators=(",", ":"),
    )
    if notes_state_row:
        batch.append(
            {
                "op": "write",
                "range": f"Notes!A{notes_state_row}:B{notes_state_row}",
                "data": [["__meta_ingest_state__", note_cell]],
            }
        )
    else:
        batch.append(
            {
                "op": "append",
                "range": "Notes!A1",
                "data": [["__meta_ingest_state__", note_cell]],
            }
        )

    # Clear any duplicate `__meta_ingest_state__` rows discovered in Notes
    for dup_row in duplicate_state_rows:
        batch.append(
            {
                "op": "clear",
                "range": f"Notes!A{dup_row}:B{dup_row}",
            }
        )

    # Write or clear overflow tombstone chunks (`__meta_ingest_tombstones_1__..5__`)
    for chunk_idx in range(1, MAX_TOMBSTONE_CHUNKS + 1):
        start_i = (chunk_idx - 1) * TOMBSTONE_CHUNK_SIZE
        end_i = start_i + TOMBSTONE_CHUNK_SIZE
        chunk_items = overflow_tombstones[start_i:end_i]
        key_name = f"__meta_ingest_tombstones_{chunk_idx}__"
        existing_row = overflow_row_map.get(chunk_idx)

        if chunk_items:
            chunk_cell = json.dumps(
                {
                    "text": json.dumps(chunk_items, separators=(",", ":")),
                    "updatedAt": now_str,
                },
                separators=(",", ":"),
            )
            if existing_row:
                batch.append(
                    {
                        "op": "write",
                        "range": f"Notes!A{existing_row}:B{existing_row}",
                        "data": [[key_name, chunk_cell]],
                    }
                )
            else:
                batch.append(
                    {
                        "op": "append",
                        "range": "Notes!A1",
                        "data": [[key_name, chunk_cell]],
                    }
                )
        elif existing_row:
            batch.append(
                {
                    "op": "clear",
                    "range": f"Notes!A{existing_row}:B{existing_row}",
                }
            )

    return batch


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Nebula Expense Tracker — Pure-Python Google Wallet 7-Day Rolling Reconciler"
    )
    parser.add_argument("--input", "-i", required=True, help="Path to incoming Wallet JSON array or '-' for stdin")
    parser.add_argument("--transactions-tsv", help="Path to exported Transactions.tsv from Google Sheets")
    parser.add_argument(
        "--transactions-json",
        help="Path to Transactions!A1:L2000 JSON read from Google Sheets (`gsheets readonly read --json`)",
    )
    parser.add_argument("--notes-json", help="Path to Notes!A1:B50 JSON read from Google Sheets")
    parser.add_argument(
        "--allow-notes-init",
        action="store_true",
        help="Allow `--batch-out` even when `--notes-json` is omitted (initializes a new Notes state row)",
    )
    parser.add_argument("--rules", help="Path to wallet_rules.json (optional; uses bundled rules by default)")
    parser.add_argument("--reference-date", help="Reference YYYY-MM-DD date for lookback window (default: today)")
    parser.add_argument("--lookback-days", type=int, default=7, help="Rolling lookback window in days (default: 7)")
    parser.add_argument("--batch-out", help="Write `gsheets mutate batch -f` JSON payload to this file path")
    parser.add_argument("--format", choices=["json", "summary"], default="json", help="Output format")
    args = parser.parse_args()

    if args.batch_out and not args.notes_json and not args.allow_notes_init:
        sys.stderr.write(
            "Error: --notes-json is required when --batch-out is specified so existing __meta_ingest_state__ "
            "and lease locks in Notes!A1:B50 are preserved (or pass --allow-notes-init for a brand-new sheet).\n"
        )
        return 2

    script_dir = os.path.dirname(os.path.abspath(__file__))
    default_rules_path = os.path.abspath(os.path.join(script_dir, "..", "references", "wallet_rules.json"))
    rules = dict(DEFAULT_RULES)
    rules_path = args.rules or (default_rules_path if os.path.exists(default_rules_path) else None)
    if rules_path and os.path.exists(rules_path):
        with open(rules_path, "r", encoding="utf-8") as rf:
            rules.update(json.load(rf))

    if args.input == "-":
        raw_payload = json.load(sys.stdin)
    else:
        with open(args.input, "r", encoding="utf-8") as inf:
            raw_payload = json.load(inf)

    incoming_list = (
        raw_payload.get("transactions", raw_payload) if isinstance(raw_payload, dict) else raw_payload
    )

    if args.transactions_json:
        existing_txs = load_transactions_json(args.transactions_json, rules)
    elif args.transactions_tsv:
        existing_txs = load_transactions_tsv(args.transactions_tsv, rules)
    else:
        existing_txs = []

    ingest_state, notes_meta = load_ingest_state_from_notes(args.notes_json)
    if args.batch_out and notes_meta.get("activeLock"):
        lock_info = notes_meta["activeLock"]
        sys.stderr.write(
            f"Error: Active ingestion lease lock held by {lock_info.get('holder', 'another process')} "
            f"until {lock_info.get('expiresAt')}. Aborting batch output.\n"
        )
        return 3

    plan = reconcile_wallet_batch(
        existing_txs=existing_txs,
        incoming_raw=incoming_list,
        ingest_state=ingest_state,
        rules=rules,
        reference_date=args.reference_date,
        lookback_days=args.lookback_days,
    )

    batch_reqs = build_gsheets_batch_requests(plan, notes_meta)
    plan["gsheetsBatchRequests"] = batch_reqs
    plan["digestMarkdown"] = format_digest_markdown(plan)

    if args.batch_out:
        with open(args.batch_out, "w", encoding="utf-8") as bf:
            json.dump(batch_reqs, bf, indent=2, ensure_ascii=False)

    if args.format == "summary":
        print(plan["digestMarkdown"])
    else:
        print(json.dumps(plan, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
