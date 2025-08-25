#!/bin/bash

# Count lines of source code, excluding node_modules and .next
# Order files by line count (ascending)

echo "Counting lines of source code..."
echo "================================"

# Find all source files excluding node_modules and .next
# Include common source file extensions
find . \
  -type f \
  \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \
     -o -name "*.css" -o -name "*.scss" -o -name "*.json" \
     -o -name "*.md" -o -name "*.sql" -o -name "*.prisma" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.next/*" \
  -not -path "*/dist/*" \
  -not -path "*/build/*" \
  -not -path "*/.git/*" \
  -print0 | \
while IFS= read -r -d '' file; do
  lines=$(wc -l < "$file" 2>/dev/null)
  if [ $? -eq 0 ]; then
    echo "$lines $file"
  fi
done | sort -n | while read lines file; do
  printf "%6d %s\n" "$lines" "$file"
done

echo "================================"
echo "TOTAL LINES OF CODE:"
find . \
  -type f \
  \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \
     -o -name "*.css" -o -name "*.scss" -o -name "*.json" \
     -o -name "*.md" -o -name "*.sql" -o -name "*.prisma" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.next/*" \
  -not -path "*/dist/*" \
  -not -path "*/build/*" \
  -not -path "*/.git/*" \
  -exec wc -l {} + 2>/dev/null | tail -n 1 | awk '{print $1}'