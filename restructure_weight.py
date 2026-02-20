import re

with open('src/pages/WeightTracker.tsx', 'r') as f:
    content = f.read()

# Match the Chart + History section
# Using regex to capture from {/* Chart + History */} to the closing </div> of that section.
# We know it's followed by {/* AI Analysis Loading */}
chart_pattern = re.compile(r'( {8}\{/\* Chart \+ History \*/\}.*?)(?= {8}\{/\* AI Analysis Loading \*/\})', re.DOTALL)
chart_match = chart_pattern.search(content)

if chart_match:
    chart_text = chart_match.group(1)
    # Remove it from original
    content = content.replace(chart_text, '')
    
    # Header insertion point
    header_pattern = r'( {8}\{/\* Header \+ Inline Log Form \*/\})'
    # Insert chart before header
    new_content = re.sub(header_pattern, chart_text + r'\n\1', content)
    
    with open('src/pages/WeightTracker.tsx', 'w') as f:
        f.write(new_content)
    print("Successfully restructured layout.")
else:
    print("Could not find Chart section!")
