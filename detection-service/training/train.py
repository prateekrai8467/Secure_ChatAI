"""
SecureChat AI - Prompt Injection Detector Training Pipeline.
Trains a calibrated Linear Support Vector Machine (Linear SVM) with TF-IDF vectorization
and exports explainable token weights for threat attribution.
"""

import os
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
import joblib

from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC
from sklearn.calibration import CalibratedClassifierCV
from sklearn.pipeline import Pipeline
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    classification_report,
    confusion_matrix
)

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
    print(f"Loaded {len(df)} records. Classes distribution:")
    print(df["label"].value_counts().to_dict())
    print(f"Category breakdown:\n{df['category'].value_counts().to_string()}\n")
    return df

def train_and_evaluate():
    start_time = time.time()
    df = load_data(DATASET_PATH)

    X = df["text"].values
    y = df["label"].values.astype(int)

    # 1. Stratified 80/20 Train-Test Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )
    print(f"Train set: {len(X_train)} samples | Test set: {len(X_test)} samples\n")

    # 2. Configure TF-IDF Feature Extractor
    # Preserves punctuation patterns like brackets, tags, and hash marks common in prompt injections
    token_pattern = r"(?u)\b\w+\b|[#<>{}\[\]\-\=]{2,}"
    vectorizer = TfidfVectorizer(
        ngram_range=(1, 3),
        sublinear_tf=True,
        min_df=1,
        max_features=10000,
        token_pattern=token_pattern,
        lowercase=True
    )

    # 3. Base Linear Support Vector Classifier
    base_svc = LinearSVC(
        C=1.0,
        loss="squared_hinge",
        dual="auto",
        random_state=42,
        max_iter=5000
    )

    # 4. Train base model on training set to extract explainable feature weights
    X_train_vec = vectorizer.fit_transform(X_train)
    base_svc.fit(X_train_vec, y_train)

    # Feature Importance / Explainability Extraction
    feature_names = vectorizer.get_feature_names_out()
    coefficients = base_svc.coef_[0]

    # Top positive coefficients (associated with adversarial prompt injection)
    top_adv_indices = np.argsort(coefficients)[::-1][:150]
    adv_weights = {
        feature_names[i]: float(coefficients[i])
        for i in top_adv_indices
        if coefficients[i] > 0
    }

    # Top negative coefficients (associated with benign prompts)
    top_benign_indices = np.argsort(coefficients)[:100]
    benign_weights = {
        feature_names[i]: float(coefficients[i])
        for i in top_benign_indices
        if coefficients[i] < 0
    }

    print(f"Extracted {len(adv_weights)} adversarial explainability tokens.")
    print("Top 15 most influential adversarial n-grams:")
    for token, weight in list(adv_weights.items())[:15]:
        print(f"  + {token:<28}: {weight:.4f}")
    print()

    # 5. Build Calibrated Pipeline for Probabilistic Threat Scoring
    calibrated_svc = CalibratedClassifierCV(
        estimator=LinearSVC(C=1.0, dual="auto", random_state=42, max_iter=5000),
        method="sigmoid",
        cv=5
    )

    full_pipeline = Pipeline([
        ("tfidf", vectorizer),
        ("classifier", calibrated_svc)
    ])

    # 6. Cross-Validation on Full Dataset (5-Fold Stratified)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_validate(
        full_pipeline,
        X,
        y,
        cv=cv,
        scoring=["accuracy", "precision", "recall", "f1", "roc_auc"]
    )

    print("=== 5-Fold Stratified Cross-Validation Results ===")
    print(f"  Accuracy : {np.mean(cv_scores['test_accuracy']):.4f} (+/- {np.std(cv_scores['test_accuracy']):.4f})")
    print(f"  Precision: {np.mean(cv_scores['test_precision']):.4f} (+/- {np.std(cv_scores['test_precision']):.4f})")
    print(f"  Recall   : {np.mean(cv_scores['test_recall']):.4f} (+/- {np.std(cv_scores['test_recall']):.4f})")
    print(f"  F1-Score : {np.mean(cv_scores['test_f1']):.4f} (+/- {np.std(cv_scores['test_f1']):.4f})")
    print(f"  ROC-AUC  : {np.mean(cv_scores['test_roc_auc']):.4f} (+/- {np.std(cv_scores['test_roc_auc']):.4f})\n")

    # 7. Fit Final Production Pipeline on Full Dataset
    full_pipeline.fit(X, y)

    # Evaluate on held-out test set
    y_pred = full_pipeline.predict(X_test)
    y_prob = full_pipeline.predict_proba(X_test)[:, 1]

    test_acc = accuracy_score(y_test, y_pred)
    test_prec = precision_score(y_test, y_pred)
    test_rec = recall_score(y_test, y_pred)
    test_f1 = f1_score(y_test, y_pred)
    test_roc_auc = roc_auc_score(y_test, y_prob)

    print("=== Held-Out Test Evaluation ===")
    print(f"  Accuracy : {test_acc:.4f}")
    print(f"  Precision: {test_prec:.4f}")
    print(f"  Recall   : {test_rec:.4f}")
    print(f"  F1-Score : {test_f1:.4f}")
    print(f"  ROC-AUC  : {test_roc_auc:.4f}\n")
    print("Classification Report:\n", classification_report(y_test, y_pred, target_names=["Benign", "Adversarial"]))

    # 8. Save Artifacts
    # Save Pipeline
    joblib.dump(full_pipeline, MODEL_OUTPUT_PATH)
    print(f"Saved calibrated model pipeline to: {MODEL_OUTPUT_PATH}")

    # Save Explainability Weights
    weights_data = {
        "adversarial_tokens": adv_weights,
        "benign_tokens": benign_weights
    }
    with open(WEIGHTS_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(weights_data, f, indent=2)
    print(f"Saved explainability feature weights to: {WEIGHTS_OUTPUT_PATH}")

    # Save Metadata
    training_duration = round(time.time() - start_time, 2)
    metadata = {
        "model_name": "LinearSVM_TFIDF_Prompt_Injection_Detector",
        "algorithm": "Linear Support Vector Classifier (Calibrated Sigmoid)",
        "feature_extractor": "TF-IDF Vectorizer (1-3 ngrams, sublinear_tf)",
        "features_count": len(feature_names),
        "dataset_size": len(df),
        "cv_metrics": {
            "accuracy": float(np.mean(cv_scores["test_accuracy"])),
            "precision": float(np.mean(cv_scores["test_precision"])),
            "recall": float(np.mean(cv_scores["test_recall"])),
            "f1_score": float(np.mean(cv_scores["test_f1"])),
            "roc_auc": float(np.mean(cv_scores["test_roc_auc"]))
        },
        "test_metrics": {
            "accuracy": float(test_acc),
            "precision": float(test_prec),
            "recall": float(test_rec),
            "f1_score": float(test_f1),
            "roc_auc": float(test_roc_auc)
        },
        "training_duration_seconds": training_duration,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }

    with open(METADATA_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(f"Saved model metadata to: {METADATA_OUTPUT_PATH}")
    print("\nTraining completed successfully!")

if __name__ == "__main__":
    train_and_evaluate()
