
Formula 1 data as yaml

Data sources:
- https://api.jolpi.ca/ergast/f1/ ( https://github.com/jolpica/jolpica-f1 )
- formula1.com ( https://www.formula1.com/en/results/2025/races )

## Get Season Information

Get season data and add it to the ergast folder. Defaults to rounds if type (-t --type) is not provided.

node index.js get -y 2025                 # ergast/2025-rounds.yaml
node index.js get -y 2025 -t rounds       # ergast/2025-rounds.yaml
node index.js get -y 2025 -t drivers      # ergast/2025-drivers.yaml
node index.js get -y 2025 -t constructors # ergast/2025-constructors.yaml

## Get Session Results

node index.js get -y 2025 -r 1            # data/2025-1-race.yaml
node index.js get -y 2025 -r 1 -s r       # data/2025-1-race.yaml

