
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

## Convert Jolpica F1 Information

node index.js convert -y 1950 -t rounds   # data/1950-rounds.yaml

## Check Data Against Schema

node index.js check data/1950-rounds.yaml schema/rounds.schema.yaml
node index.js check data/1950-drivers.yaml schema/drivers.schema.yaml
node index.js check data/1950-constructors.yaml schema/constructors.schema.yaml


TODO: grid positions

for f in $( ls data/*-grid.yaml ); do ; e=$(cat  $f | grep "position: 0") ; if [ "$e" != "" ]; then echo $f; fi ; done

node index.js get -y 1959 -r 4 -s g