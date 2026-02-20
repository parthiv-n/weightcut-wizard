import os
import json
import glob
import re

RESEARCH_DIR = "src/assets/research"
INDEX_FILE = "src/data/chatbot-index.json"

def get_title(content, filename):
    match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
    return match.group(1).strip() if match else filename

def get_summary(content):
    # Try to find "Abstract:" or similar
    match = re.search(r'Abstract:?\s*(.+?)(?=\n\n|\n#)', content, re.IGNORECASE | re.DOTALL)
    if match:
        text = match.group(1).strip()
    else:
        # Just grab the first regular paragraph after removing frontmatter or codeblocks
        # Strip out code blocks
        clean = re.sub(r'```.*?```', '', content, flags=re.DOTALL)
        clean = re.sub(r'^#.*$', '', clean, flags=re.MULTILINE)
        paragraphs = [p.strip() for p in clean.split('\n\n') if p.strip()]
        text = paragraphs[0] if paragraphs else ""
    
    # Take first 2 sentences
    sentences = re.split(r'(?<=[.!?])\s+', text.replace('\n', ' '))
    return ' '.join(sentences[:2]) if sentences else "No summary available."

def extract_data():
    os.makedirs(os.path.dirname(INDEX_FILE), exist_ok=True)
    
    existing_index = []
    if os.path.exists(INDEX_FILE):
        with open(INDEX_FILE, 'r', encoding='utf-8') as f:
            try:
                existing_index = json.load(f)
            except json.JSONDecodeError:
                existing_index = []

    # Map by filename to update existing ones
    index_map = {item['filename']: item for item in existing_index}

    for filepath in glob.glob(os.path.join(RESEARCH_DIR, "*.md")):
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        filename = os.path.basename(filepath)
        title = get_title(content, filename)
        summary = get_summary(content)

        entry = {
            "title": title,
            "filename": filename,
            "summary": summary,
            "content": content
        }
        
        index_map[filename] = entry

    # Write back
    with open(INDEX_FILE, 'w', encoding='utf-8') as f:
        json.dump(list(index_map.values()), f, indent=2, ensure_ascii=False)

    print(f"Updated index with {len(index_map)} entries.")

if __name__ == "__main__":
    extract_data()
