
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

node index.js get -y 2025 -r 6 -s p1 -f f1 # practice 1 from f1.com
node index.js get -y 2025 -r 6 -s sq -f f1 # sprint qualifying from f1.com
node index.js get -y 2025 -r 6 -s sg -f f1 # sprint grid from f1.com
node index.js get -y 2025 -r 6 -s s  -f f1 # sprint results from f1.com
node index.js get -y 2025 -r 6 -s q  -f f1 # race qualifying from f1.com
node index.js get -y 2025 -r 6 -s g  -f f1 # race grid from f1.com
node index.js generate -y 2025 -t drivers  # update drivers table
node index.js get -y 2025 -r 6 -s r  -f f1 # race from f1.com
node index.js generate -y 2025 -t drivers  # update drivers table

## Convert Jolpica F1 Information

node index.js convert -y 1950 -t rounds   # data/1950-rounds.yaml

## Check Data Against Schema

node index.js check data/1950-rounds.yaml schema/rounds.schema.yaml
node index.js check data/1950-drivers.yaml schema/drivers.schema.yaml
node index.js check data/1950-constructors.yaml schema/constructors.schema.yaml


TODO: grid positions

