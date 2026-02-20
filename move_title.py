import re

with open('src/pages/WeightTracker.tsx', 'r') as f:
    content = f.read()

# We need to move `<h1 className="text-xl font-bold">Weight</h1>` back to the top of the container
title_pattern = r'<h1 className="text-xl font-bold">Weight</h1>\n'
content = content.replace(title_pattern, '')

# Now find the top container: `<div className="space-y-5 px-4 pb-4 pt-16 sm:p-5 sm:pt-16 max-w-2xl mx-auto">\n`
container_pattern = r'(<div className="space-y-5 px-4 pb-4 pt-16 sm:p-5 sm:pt-16 max-w-2xl mx-auto">\n)'
content = re.sub(container_pattern, r'\1        <h1 className="text-xl font-bold">Weight</h1>\n', content)

with open('src/pages/WeightTracker.tsx', 'w') as f:
    f.write(content)
print("Title shifted!")
