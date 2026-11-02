"""
SecureChat AI - Multilingual Prompt Injection Detector Training Pipeline (Phase 4C).
Trains a calibrated Linear Support Vector Machine (Linear SVM) with a Hybrid FeatureUnion
of Indic-Aware Word TF-IDF and Subword/Character-WB TF-IDF.
Exports explainable feature weights and comprehensive model metadata.
"""

import os
import sys
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
import joblib

from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import Pipeline, FeatureUnion
from sklearn.svm import LinearSVC
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    classification_report,
    confusion_matrix
)

sys.stdout.reconfigure(encoding='utf-8')

# Paths configuration
BASE_DIR = Path(__file__).resolve().parent.parent
DATASET_PATH = BASE_DIR / "dataset" / "dataset.json"
MODELS_DIR = BASE_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

MODEL_OUTPUT_PATH = MODELS_DIR / "pipeline.joblib"
WEIGHTS_OUTPUT_PATH = MODELS_DIR / "feature_weights.json"
METADATA_OUTPUT_PATH = MODELS_DIR / "model_metadata.json"

def load_data(filepath: Path):
    """Load and validate the dataset."""
    print(f"Loading dataset from: {filepath}")
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    df = pd.DataFrame(data)
    print(f"Loaded {len(df)} records. Class distribution:")
    print(df["label"].value_counts().to_dict())
    if "language" in df.columns:
        print(f"Language breakdown: {df['language'].value_counts().to_dict()}")
    print(f"Category breakdown:\n{df['category'].value_counts().to_string()}\n")
    return df

def build_feature_extractor():
    """
    Build Hybrid FeatureUnion:
    1. Word-level TF-IDF with Indic Unicode code points range (U+0900 to U+097F).
    2. Character-within-word (char_wb) TF-IDF capturing subword morphs and transliterations.
    """
    word_vectorizer = TfidfVectorizer(
        ngram_range=(1, 3),
        sublinear_tf=True,
        min_df=1,
        max_features=10000,
        token_pattern=r"(?u)[\w\u0900-\u097F]+|[#<>{}\[\]\-\=]{2,}",
        lowercase=True
    )

    char_vectorizer = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(3, 5),
        sublinear_tf=True,
        min_df=2,
        max_features=8000,
        lowercase=True
    )

    return FeatureUnion([
        ("word", word_vectorizer),
        ("char", char_vectorizer)
    ])

def train_and_evaluate():
    start_time = time.time()
    df = load_data(DATASET_PATH)

    X = df["text"].values
    y = df["label"].values.astype(int)
    langs = df["language"].values if "language" in df.columns else np.array(["en"] * len(df))

    # 1. Stratified 80/20 Train-Test Split
    X_train, X_test, y_train, y_test, lang_train, lang_test = train_test_split(
        X, y, langs, test_size=0.20, random_state=42, stratify=y
    )
    print(f"Train set: {len(X_train)} samples | Held-out test set: {len(X_test)} samples\n")

    # 2. Build Feature Extractor
    feature_extractor = build_feature_extractor()

    # 3. Train base LinearSVC for Explainability Weights Extraction
    base_svc = LinearSVC(
        C=1.0,
        loss="squared_hinge",
        dual="auto",
        random_state=42,
        max_iter=5000
    )

    X_train_vec = feature_extractor.fit_transform(X_train)
    base_svc.fit(X_train_vec, y_train)

    feature_names = feature_extractor.get_feature_names_out()
    coefficients = base_svc.coef_[0]

    # Extract Top Adversarial Weights (positive coefficients)
    top_adv_indices = np.argsort(coefficients)[::-1]
    adv_weights = {}
    for idx in top_adv_indices:
        if coefficients[idx] <= 0:
            break
        raw_name = feature_names[idx]
        clean_name = raw_name.replace("word__", "").replace("char__", "").strip()
        if clean_name and clean_name not in adv_weights:
            adv_weights[clean_name] = round(float(coefficients[idx]), 4)
        if len(adv_weights) >= 300:
            break

    # Extract Top Benign Weights (negative coefficients)
    top_benign_indices = np.argsort(coefficients)
    benign_weights = {}
    for idx in top_benign_indices:
        if coefficients[idx] >= 0:
            break
        raw_name = feature_names[idx]
        clean_name = raw_name.replace("word__", "").replace("char__", "").strip()
        if clean_name and clean_name not in benign_weights:
            benign_weights[clean_name] = round(float(coefficients[idx]), 4)
        if len(benign_weights) >= 200:
            break

    print(f"Extracted {len(adv_weights)} adversarial explainability tokens.")
    print("Sample top adversarial features:")
    for token, weight in list(adv_weights.items())[:15]:
        print(f"  + {token:<28}: {weight:.4f}")
    print()

    # 4. Build Calibrated Pipeline for Probabilistic Threat Scoring
    calibrated_svc = CalibratedClassifierCV(
        estimator=LinearSVC(C=1.0, dual="auto", random_state=42, max_iter=5000),
        method="sigmoid",
        cv=5
    )

    full_pipeline = Pipeline([
        ("features", build_feature_extractor()),
        ("classifier", calibrated_svc)
    ])

    # 5. 5-Fold Stratified Cross-Validation on Full Dataset
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_validate(
        full_pipeline,
        X,
        y,
        cv=cv,
        scoring=["accuracy", "precision", "recall", "f1", "roc_auc"]
    )

    cv_metrics = {
        "accuracy_mean": round(float(np.mean(cv_scores["test_accuracy"])), 4),
        "accuracy_std": round(float(np.std(cv_scores["test_accuracy"])), 4),
        "precision_mean": round(float(np.mean(cv_scores["test_precision"])), 4),
        "precision_std": round(float(np.std(cv_scores["test_precision"])), 4),
        "recall_mean": round(float(np.mean(cv_scores["test_recall"])), 4),
        "recall_std": round(float(np.std(cv_scores["test_recall"])), 4),
        "f1_mean": round(float(np.mean(cv_scores["test_f1"])), 4),
        "f1_std": round(float(np.std(cv_scores["test_f1"])), 4),
        "roc_auc_mean": round(float(np.mean(cv_scores["test_roc_auc"])), 4),
        "roc_auc_std": round(float(np.std(cv_scores["test_roc_auc"])), 4),
    }

    print("=== 5-Fold Stratified Cross-Validation Results ===")
    print(f"  Accuracy : {cv_metrics['accuracy_mean']:.4f} (+/- {cv_metrics['accuracy_std']:.4f})")
    print(f"  Precision: {cv_metrics['precision_mean']:.4f} (+/- {cv_metrics['precision_std']:.4f})")
    print(f"  Recall   : {cv_metrics['recall_mean']:.4f} (+/- {cv_metrics['recall_std']:.4f})")
    print(f"  F1-Score : {cv_metrics['f1_mean']:.4f} (+/- {cv_metrics['f1_std']:.4f})")
    print(f"  ROC-AUC  : {cv_metrics['roc_auc_mean']:.4f} (+/- {cv_metrics['roc_auc_std']:.4f})\n")

    # 6. Fit Final Pipeline on Full Dataset
    full_pipeline.fit(X, y)

    # 7. Evaluate on Held-out Test Set (trained on X_train for clean held-out reporting)
    eval_pipeline = Pipeline([
        ("features", build_feature_extractor()),
        ("classifier", CalibratedClassifierCV(
            estimator=LinearSVC(C=1.0, dual="auto", random_state=42, max_iter=5000),
            method="sigmoid",
            cv=5
        ))
    ])
    eval_pipeline.fit(X_train, y_train)
    y_pred = eval_pipeline.predict(X_test)
    y_prob = eval_pipeline.predict_proba(X_test)[:, 1]

    tn, fp, fn, tp = confusion_matrix(y_test, y_pred).ravel()

    test_metrics = {
        "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
        "precision": round(float(precision_score(y_test, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, y_pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_test, y_pred, zero_division=0)), 4),
        "roc_auc": round(float(roc_auc_score(y_test, y_prob)), 4),
        "false_positive_rate": round(float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0, 4),
        "confusion_matrix": {
            "true_positives": int(tp),
            "false_positives": int(fp),
            "true_negatives": int(tn),
            "false_negatives": int(fn)
        }
    }

    # Language breakdown on held-out test split
    language_performance = {}
    for lang in np.unique(lang_test):
        mask = (lang_test == lang)
        sub_y_true = y_test[mask]
        sub_y_pred = y_pred[mask]
        language_performance[lang] = {
            "samples": int(sum(mask)),
            "accuracy": round(float(accuracy_score(sub_y_true, sub_y_pred)), 4),
            "recall": round(float(recall_score(sub_y_true, sub_y_pred, zero_division=0)), 4),
            "precision": round(float(precision_score(sub_y_true, sub_y_pred, zero_division=0)), 4),
            "f1": round(float(f1_score(sub_y_true, sub_y_pred, zero_division=0)), 4)
        }

    print("=== Held-Out Test Set Metrics ===")
    print(f"  Accuracy : {test_metrics['accuracy']:.4f}")
    print(f"  Precision: {test_metrics['precision']:.4f}")
    print(f"  Recall   : {test_metrics['recall']:.4f}")
    print(f"  F1-Score : {test_metrics['f1']:.4f}")
    print(f"  FPR      : {test_metrics['false_positive_rate']:.4f}")
    print(f"  Confusion Matrix: TP={tp}, FP={fp}, TN={tn}, FN={fn}\n")

    print("=== Held-Out Test Set Breakdown by Language ===")
    for lang, metrics in language_performance.items():
        print(f"  [{lang.upper()}] (N={metrics['samples']}): Acc={metrics['accuracy']:.4f}, Recall={metrics['recall']:.4f}, Precision={metrics['precision']:.4f}, F1={metrics['f1']:.4f}")

    # 8. Save Pipeline Artifacts
    joblib.dump(full_pipeline, MODEL_OUTPUT_PATH, compress=3)
    print(f"\nSaved trained pipeline to: {MODEL_OUTPUT_PATH}")

    # Save feature weights
    weights_data = {
        "adversarial_tokens": adv_weights,
        "benign_tokens": benign_weights
    }
    with open(WEIGHTS_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(weights_data, f, indent=2, ensure_ascii=False)
    print(f"Saved feature weights to: {WEIGHTS_OUTPUT_PATH}")

    # Save metadata
    elapsed_time = round(time.time() - start_time, 2)
    metadata = {
        "model_type": "LinearSVC with CalibratedClassifierCV (Sigmoid/Platt Scaling)",
        "vectorizer": "FeatureUnion: Indic-Aware Word TF-IDF (1-3 ngrams) + Char-WB TF-IDF (3-5 ngrams)",
        "training_date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total_samples": int(len(df)),
        "benign_samples": int(sum(y == 0)),
        "adversarial_samples": int(sum(y == 1)),
        "languages": list(df["language"].unique()) if "language" in df.columns else ["en"],
        "cross_validation_metrics": cv_metrics,
        "test_metrics": test_metrics,
        "language_performance": language_performance,
        "training_time_seconds": elapsed_time
    }
    with open(METADATA_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    print(f"Saved model metadata to: {METADATA_OUTPUT_PATH}")

    print(f"\nTraining pipeline completed successfully in {elapsed_time}s.")
    return full_pipeline, metadata

if __name__ == "__main__":
    train_and_evaluate()
