import os
import json

RESEARCH_DIR = 'src/assets/research'
OUTPUT_INDEX = 'src/data/chatbot-index.json'
EDGE_FUNC_INDEX = 'supabase/functions/wizard-chat/chatbot-index.json'

def get_summary(content):
    # Extract the first paragraph or abstract as summary
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if 'Abstract' in line or 'objective' in line.lower() or 'summary' in line.lower():
            # Return next non-empty lines
            summary = []
            for j in range(i, min(i+15, len(lines))):
                if lines[j].strip():
                    summary.append(lines[j].strip())
            if summary:
                return " ".join(summary)[:500] + "..."
    # Fallback to first 500 chars
    return content[:500].replace('\n', ' ') + "..."

def main():
    docs = []
    
    for filename in sorted(os.listdir(RESEARCH_DIR)):
        if not filename.endswith('.md'):
            continue
            
        filepath = os.path.join(RESEARCH_DIR, filename)
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Try to find a title
        title = filename
        for line in content.split('\n'):
            if line.startswith('# '):
                title = line[2:].strip()
                break
                
        docs.append({
            "title": title,
            "filename": filename,
            "summary": get_summary(content),
            "content": content
        })
        
    # Write to src/data
    os.makedirs(os.path.dirname(OUTPUT_INDEX), exist_ok=True)
    with open(OUTPUT_INDEX, 'w', encoding='utf-8') as f:
        json.dump(docs, f, indent=2)
        
    # Copy to edge function
    os.makedirs(os.path.dirname(EDGE_FUNC_INDEX), exist_ok=True)
    with open(EDGE_FUNC_INDEX, 'w', encoding='utf-8') as f:
        json.dump(docs, f, indent=2)
        
    print(f"Successfully parsed {len(docs)} documents and updated indexes.")

if __name__ == "__main__":
    main()
