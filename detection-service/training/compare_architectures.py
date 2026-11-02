"""
SecureChat AI - Model Architecture Comparison & Evaluation (Phase 4C).
Compares:
1. Arch A: Standard Word TF-IDF with baseline token pattern
2. Arch B: Indic-aware Word TF-IDF (r'(?u)[\w\u0900-\u097F]+|[#<>{}\[\]\-\=]{2,}')
3. Arch C: Hybrid FeatureUnion of Indic-aware Word TF-IDF + Subword/Char-WB TF-IDF
Evaluates cross-validation, held-out test split, and benchmark interception.
"""

import sys
import json
import numpy as np
import pandas as pd
from pathlib import Path

from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import Pipeline, FeatureUnion
from sklearn.svm import LinearSVC
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

sys.stdout.reconfigure(encoding='utf-8')

DATASET_PATH = Path(__file__).resolve().parent.parent / "dataset" / "dataset.json"
BENCHMARK_PATH = Path(__file__).resolve().parent.parent.parent / "evaluation" / "benchmarks" / "advanced_benchmark_suite.json"

df = pd.DataFrame(json.load(open(DATASET_PATH, encoding="utf-8")))
X = df["text"].values
y = df["label"].values.astype(int)
langs = df["language"].values

print(f"Total Dataset Records: {len(df)} | Benign: {sum(y==0)} | Adversarial: {sum(y==1)}")

# 80/20 Stratified Split
X_train, X_test, y_train, y_test, lang_train, lang_test = train_test_split(
    X, y, langs, test_size=0.20, random_state=42, stratify=y
)

print(f"Train samples: {len(X_train)} | Test samples: {len(X_test)}")

# Load Benchmark Suite
benchmark_cases = json.load(open(BENCHMARK_PATH, encoding="utf-8"))
bm_prompts = [c["prompt"] for c in benchmark_cases]
bm_attacks = [c["is_attack"] for c in benchmark_cases]

# Define Pipeline Architectures
arch_a_vec = TfidfVectorizer(
    ngram_range=(1, 3),
    sublinear_tf=True,
    min_df=1,
    max_features=12000,
    token_pattern=r"(?u)\b\w+\b|[#<>{}\[\]\-\=]{2,}",
    lowercase=True
)

arch_b_vec = TfidfVectorizer(
    ngram_range=(1, 3),
    sublinear_tf=True,
    min_df=1,
    max_features=12000,
    token_pattern=r"(?u)[\w\u0900-\u097F]+|[#<>{}\[\]\-\=]{2,}",
    lowercase=True
)

arch_c_union = FeatureUnion([
    ("word_tfidf", TfidfVectorizer(
        ngram_range=(1, 3),
        sublinear_tf=True,
        min_df=1,
        max_features=10000,
        token_pattern=r"(?u)[\w\u0900-\u097F]+|[#<>{}\[\]\-\=]{2,}",
        lowercase=True
    )),
    ("char_tfidf", TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(3, 5),
        sublinear_tf=True,
        min_df=2,
        max_features=8000,
        lowercase=True
    ))
])

architectures = {
    "Arch A (Baseline Word Pattern)": arch_a_vec,
    "Arch B (Indic-Aware Word Pattern)": arch_b_vec,
    "Arch C (Hybrid Word + Char-WB Union)": arch_c_union
}

cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

for name, feature_extractor in architectures.items():
    print("\n" + "=" * 70)
    print(f" EVALUATING: {name}")
    print("=" * 70)

    pipe = Pipeline([
        ("features", feature_extractor),
        ("classifier", CalibratedClassifierCV(
            estimator=LinearSVC(C=1.0, dual="auto", random_state=42, max_iter=5000),
            method="sigmoid",
            cv=5
        ))
    ])

    # 1. Cross-Validation
    cv_res = cross_validate(pipe, X, y, cv=cv, scoring=["accuracy", "precision", "recall", "f1"])
    print(f"5-Fold CV Accuracy : {np.mean(cv_res['test_accuracy']):.4f} (+/- {np.std(cv_res['test_accuracy']):.4f})")
    print(f"5-Fold CV Precision: {np.mean(cv_res['test_precision']):.4f} (+/- {np.std(cv_res['test_precision']):.4f})")
    print(f"5-Fold CV Recall   : {np.mean(cv_res['test_recall']):.4f} (+/- {np.std(cv_res['test_recall']):.4f})")
    print(f"5-Fold CV F1-Score : {np.mean(cv_res['test_f1']):.4f} (+/- {np.std(cv_res['test_f1']):.4f})")

    # 2. Train on train set, test on test set
    pipe.fit(X_train, y_train)
    preds = pipe.predict(X_test)
    probs = pipe.predict_proba(X_test)[:, 1]

    acc = accuracy_score(y_test, preds)
    prec = precision_score(y_test, preds, zero_division=0)
    rec = recall_score(y_test, preds, zero_division=0)
    f1 = f1_score(y_test, preds, zero_division=0)
    tn, fp, fn, tp = confusion_matrix(y_test, preds).ravel()
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0

    print(f"\nHeld-Out Test Set (N={len(X_test)}):")
    print(f"  Accuracy: {acc:.4f} | Precision: {prec:.4f} | Recall: {rec:.4f} | F1: {f1:.4f} | FPR: {fpr:.4f}")
    print(f"  Confusion Matrix: TP={tp}, FP={fp}, TN={tn}, FN={fn}")

    # Language breakdown on held-out test set
    print("\nHeld-Out Test Performance by Language:")
    for lang in ["en", "hi", "hinglish"]:
        mask = (lang_test == lang)
        if sum(mask) > 0:
            lang_acc = accuracy_score(y_test[mask], preds[mask])
            lang_rec = recall_score(y_test[mask], preds[mask], zero_division=0)
            lang_prec = precision_score(y_test[mask], preds[mask], zero_division=0)
            print(f"  [{lang.upper()}] (N={sum(mask)}): Acc={lang_acc:.4f}, Rec={lang_rec:.4f}, Prec={lang_prec:.4f}")

    # 3. Fit on full dataset and evaluate on independent benchmark suite
    pipe.fit(X, y)
    bm_probs = pipe.predict_proba(bm_prompts)[:, 1]
    bm_blocked = [(p >= 0.70) for p in bm_probs]
    
    bm_tp = sum(1 for is_att, blk in zip(bm_attacks, bm_blocked) if is_att and blk)
    bm_fn = sum(1 for is_att, blk in zip(bm_attacks, bm_blocked) if is_att and not blk)
    bm_tn = sum(1 for is_att, blk in zip(bm_attacks, bm_blocked) if not is_att and not blk)
    bm_fp = sum(1 for is_att, blk in zip(bm_attacks, bm_blocked) if not is_att and blk)

    bm_attacks_total = sum(bm_attacks)
    bm_benign_total = len(bm_attacks) - bm_attacks_total
    bm_interception = bm_tp / bm_attacks_total if bm_attacks_total > 0 else 0.0
    bm_fpr = bm_fp / bm_benign_total if bm_benign_total > 0 else 0.0

    print(f"\nIndependent Benchmark Suite (N={len(benchmark_cases)}):")
    print(f"  Attacks Intercepted: {bm_tp}/{bm_attacks_total} ({bm_interception * 100:.1f}%)")
    print(f"  Attacks Evaded     : {bm_fn}/{bm_attacks_total}")
    print(f"  False Positive Rate: {bm_fpr * 100:.1f}% ({bm_fp}/{bm_benign_total})")

    # Specifically check the 4 Hindi benchmark cases
    print("  Devanagari Hindi Benchmark Cases:")
    for c in benchmark_cases:
        if c["id"].startswith("SEC-MULTI-03"):
            score = pipe.predict_proba([c["prompt"]])[0][1]
            status = "BLOCKED" if score >= 0.70 else "FLAGGED" if score >= 0.40 else "ALLOWED"
            print(f"    {c['id']} ({c['name']}): Score={score:.4f} -> [{status}]")

print("\n" + "=" * 70)
print(" COMPARISON EXPERIMENT COMPLETE")
print("=" * 70)
