"""
SecureChat AI — Pre-Classification Input Normalization Engine.
Safely normalizes input text prior to ML and guardrail classification:
1. Strips zero-width and invisible Unicode characters.
2. Canonicalizes targeted Cyrillic and Greek homoglyphs to Latin equivalents.
3. Decodes and maps mixed-word Leetspeak substitutions.
4. Safely detects and decodes bounded Base64 candidate payloads for inspection.
5. Preserves legitimate multilingual scripts (e.g. Devanagari Hindi) without corruption.
"""

import re
import base64
import unicodedata
from typing import Dict, List, Tuple, Any, Optional

# Zero-width and invisible formatting characters
INVISIBLE_CHARS = {
    '\u200b',  # Zero-width space
    '\u200c',  # Zero-width non-joiner
    '\u200d',  # Zero-width joiner
    '\u200e',  # Left-to-right mark
    '\u200f',  # Right-to-left mark
    '\u202a',  # Left-to-right embedding
    '\u202b',  # Right-to-left embedding
    '\u202c',  # Pop directional formatting
    '\u202d',  # Left-to-right override
    '\u202e',  # Right-to-left override
    '\u2060',  # Word joiner
    '\ufeff',  # Zero-width no-break space / BOM
    '\u00ad',  # Soft hyphen
}

INVISIBLE_REGEX = re.compile('[' + ''.join(re.escape(c) for c in INVISIBLE_CHARS) + ']')

# Targeted Confusable Homoglyphs (Cyrillic & Greek characters confusable with Latin ASCII)
# Devanagari (Hindi) and other non-confusable scripts are NOT in this mapping.
HOMOGLYPH_MAP = {
    # Cyrillic lowercase
    '\u0430': 'a',  # а
    '\u0435': 'e',  # е
    '\u043e': 'o',  # о
    '\u0440': 'p',  # р
    '\u0441': 'c',  # с
    '\u0443': 'y',  # у
    '\u0445': 'x',  # х
    '\u0456': 'i',  # і
    '\u0458': 'j',  # ј
    '\u0455': 's',  # ѕ
    # Cyrillic uppercase
    '\u0410': 'A',  # А
    '\u0412': 'B',  # В
    '\u0415': 'E',  # Е
    '\u041a': 'K',  # К
    '\u041c': 'M',  # М
    '\u041d': 'H',  # Н
    '\u041e': 'O',  # О
    '\u0420': 'P',  # Р
    '\u0421': 'C',  # С
    '\u0422': 'T',  # Т
    '\u0425': 'X',  # Х
    '\u0406': 'I',  # І
    '\u04ae': 'Y',  # Ү
    # Greek lowercase
    '\u03b1': 'a',  # α
    '\u03b5': 'e',  # ε
    '\u03b9': 'i',  # ι
    '\u03ba': 'k',  # κ
    '\u03bf': 'o',  # ο
    '\u03c1': 'p',  # ρ
    '\u03c5': 'u',  # υ
    '\u03c7': 'x',  # χ
    # Greek uppercase
    '\u0391': 'A',  # Α
    '\u0392': 'B',  # Β
    '\u0395': 'E',  # Ε
    '\u0399': 'I',  # Ι
    '\u039a': 'K',  # Κ
    '\u039c': 'M',  # Μ
    '\u039d': 'N',  # Ν
    '\u039f': 'O',  # Ο
    '\u03a1': 'P',  # Ρ
    '\u03a4': 'T',  # Τ
    '\u03a7': 'X',  # Χ
    '\u03a5': 'Y',  # Υ
}

# Known isolated or mixed leetspeak word substitutions
KNOWN_LEET_WORDS = {
    '1gn0r3': 'ignore',
    'ign0re': 'ignore',
    '1gnore': 'ignore',
    '4ll': 'all',
    'pr3v10us': 'previous',
    'prev1ous': 'previous',
    'pr3vious': 'previous',
    '1n57ruc710n5': 'instructions',
    '1nstruct10ns': 'instructions',
    'instruct1ons': 'instructions',
    'd4n': 'dan',
    'y0u': 'you',
    '4r3': 'are',
    'n0w': 'now',
    'rul35': 'rules',
    'rul3s': 'rules',
    'f1l73r5': 'filters',
    'f1lters': 'filters',
    '5y573m': 'system',
    'syst3m': 'system',
    'pr0mp7': 'prompt',
    'pr0mpt': 'prompt',
    'l34k': 'leak',
    '0v3rr1d3': 'override',
    '0verride': 'override',
    'byp455': 'bypass',
    'byp4ss': 'bypass',
}

# Single-character leetspeak translation table within words
LEET_CHAR_MAP = {
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '7': 't',
    '@': 'a',
    '$': 's'
}

# Regex to detect Base64-like candidate blocks (minimum 12 characters, properly aligned or padded)
BASE64_REGEX = re.compile(r'(?<![A-Za-z0-9+/])(?:[A-Za-z0-9+/]{4}){2,}(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)(?![A-Za-z0-9+/=])')

# Maximum payload size to decode to protect against resource exhaustion
MAX_BASE64_DECODE_BYTES = 4096

class NormalizationResult:
    """Represents the multi-variant analysis representation of an input prompt."""
    def __init__(self, original_text: str):
        self.original_text: str = original_text
        self.normalized_text: str = original_text
        self.decoded_payloads: List[str] = []
        self.obfuscations_detected: List[str] = []
        self.flags: Dict[str, bool] = {
            "zero_width_stripped": False,
            "homoglyphs_replaced": False,
            "leetspeak_normalized": False,
            "base64_decoded": False,
            "unicode_nfkd_normalized": False
        }

    def get_scan_candidates(self) -> List[Tuple[str, str]]:
        """
        Return candidate text variations for security classification:
        Pairs of (text, source_variant_tag).
        """
        candidates = [(self.original_text, "original")]
        if self.normalized_text != self.original_text:
            candidates.append((self.normalized_text, "normalized"))
        for idx, payload in enumerate(self.decoded_payloads):
            candidates.append((payload, f"base64_payload_{idx + 1}"))
            # Also normalize decoded base64 payloads
            norm_payload, _ = normalize_text_single(payload)
            if norm_payload != payload:
                candidates.append((norm_payload, f"base64_payload_norm_{idx + 1}"))
        return candidates

def strip_invisible_characters(text: str) -> Tuple[str, bool]:
    """Remove zero-width spaces and invisible directional controls."""
    stripped, count = INVISIBLE_REGEX.subn('', text)
    return stripped, (count > 0)

def normalize_homoglyphs(text: str) -> Tuple[str, bool]:
    """
    Replace confusable Cyrillic and Greek homoglyphs with standard Latin equivalents.
    Leaves non-confusable scripts (such as Devanagari Hindi) completely untouched.
    """
    chars = []
    replaced = False
    for ch in text:
        if ch in HOMOGLYPH_MAP:
            chars.append(HOMOGLYPH_MAP[ch])
            replaced = True
        else:
            chars.append(ch)
    return ''.join(chars), replaced

def normalize_leetspeak_word(word: str) -> str:
    """
    Normalize an individual word if it matches known leetspeak or contains
    mixed alphanumeric letters and digits (e.g., '1gn0r3' -> 'ignore').
    Leaves standalone numeric quantities (e.g., '30', '500', '2026') intact.
    """
    lower = word.lower()
    # Check known leet words
    if lower in KNOWN_LEET_WORDS:
        return KNOWN_LEET_WORDS[lower]

    # Only process tokens that have BOTH alphabetic characters AND leetspeak digits/symbols
    # or start with a digit followed by letters (e.g. '1gnore', '4ll')
    has_letters = bool(re.search(r'[a-zA-Z]', word))
    has_leet_chars = bool(re.search(r'[013457@$]', word))

    # If it is purely digits (e.g. '100', '30', '500'), DO NOT alter it!
    if word.isdigit():
        return word

    if has_letters and has_leet_chars:
        chars = []
        for ch in word:
            if ch in LEET_CHAR_MAP:
                chars.append(LEET_CHAR_MAP[ch])
            else:
                chars.append(ch)
        return ''.join(chars)

    # Word starting with leet digit and having length > 1 (e.g. '1gn0r3', '4ll', '7h3')
    if has_leet_chars and len(word) >= 2 and any(ch.isalpha() for ch in word):
        chars = []
        for ch in word:
            if ch in LEET_CHAR_MAP:
                chars.append(LEET_CHAR_MAP[ch])
            else:
                chars.append(ch)
        return ''.join(chars)

    return word

def normalize_leetspeak(text: str) -> Tuple[str, bool]:
    """Scan and normalize leetspeak tokens within text without affecting standalone numbers."""
    tokens = re.split(r'(\s+|[^\w@$])', text)
    modified = False
    new_tokens = []
    for token in tokens:
        new_token = normalize_leetspeak_word(token)
        if new_token != token:
            modified = True
        new_tokens.append(new_token)
    return ''.join(new_tokens), modified

def detect_and_decode_base64(text: str) -> List[str]:
    """
    Safely find and decode valid Base64 blocks in the input text.
    Strict bounds and validation prevent memory exhaustion or false-decode errors.
    """
    decoded_strings = []
    matches = BASE64_REGEX.findall(text)

    for match in matches:
        if len(match) > MAX_BASE64_DECODE_BYTES:
            continue
        try:
            raw_bytes = base64.b64decode(match, validate=True)
            # Attempt decoding as UTF-8
            decoded_text = raw_bytes.decode('utf-8', errors='ignore').strip()
            # Verify decoded text looks like printable natural language or code (>80% printable)
            if len(decoded_text) >= 4:
                printable_ratio = sum(c.isprintable() or c.isspace() for c in decoded_text) / len(decoded_text)
                if printable_ratio >= 0.85:
                    decoded_strings.append(decoded_text)
        except Exception:
            # Silently ignore non-base64 tokens
            pass

    return decoded_strings

def normalize_text_single(text: str) -> Tuple[str, Dict[str, bool]]:
    """Applies zero-width, homoglyph, and leetspeak normalization to a single string."""
    flags = {}

    # 1. Strip invisible characters
    cleaned, zw_flag = strip_invisible_characters(text)
    flags["zero_width_stripped"] = zw_flag

    # 2. Homoglyph canonicalization
    cleaned, hg_flag = normalize_homoglyphs(cleaned)
    flags["homoglyphs_replaced"] = hg_flag

    # 3. Unicode NFKD normalization (collapses compatibility characters, fullwidth spaces)
    nfkd_cleaned = unicodedata.normalize('NFKD', cleaned)
    flags["unicode_nfkd_normalized"] = (nfkd_cleaned != cleaned)

    # 4. Leetspeak normalization
    final_text, leet_flag = normalize_leetspeak(nfkd_cleaned)
    flags["leetspeak_normalized"] = leet_flag

    return final_text, flags

def normalize_prompt(text: str) -> NormalizationResult:
    """
    Master pre-classification normalization pipeline.
    Produces comprehensive multi-variant representation without modifying original prompt.
    """
    result = NormalizationResult(text)
    if not text or not isinstance(text, str):
        return result

    # 1. Run single-string normalization
    norm_text, flags = normalize_text_single(text)
    result.normalized_text = norm_text
    result.flags.update(flags)

    # 2. Extract base64 candidate payloads
    decoded_payloads = detect_and_decode_base64(text)
    if decoded_payloads:
        result.decoded_payloads = decoded_payloads
        result.flags["base64_decoded"] = True

    # 3. Collect human-readable obfuscation tags
    if result.flags["zero_width_stripped"]:
        result.obfuscations_detected.append("zero_width_characters")
    if result.flags["homoglyphs_replaced"]:
        result.obfuscations_detected.append("unicode_homoglyphs")
    if result.flags["leetspeak_normalized"]:
        result.obfuscations_detected.append("leetspeak_substitutions")
    if result.flags["base64_decoded"]:
        result.obfuscations_detected.append("base64_encoded_payload")

    return result
