import re

with open('src/pages/WeightTracker.tsx', 'r') as f:
    content = f.read()

# I accidentally left a second `<h1 className="text-xl font-bold">Weight</h1>` lower in the file during the regex replace
duplicate_pattern = r'        <h1 className="text-xl font-bold">Weight</h1>\n          <form onSubmit=\{handleAddWeight\} className="flex gap-2 items-center">'
content = re.sub(duplicate_pattern, r'          <form onSubmit={handleAddWeight} className="flex gap-2 items-center">', content)

with open('src/pages/WeightTracker.tsx', 'w') as f:
    f.write(content)
print("Removed duplicate title")
