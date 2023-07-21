import * as express from 'express';
import * as morgan from 'morgan';

import { notNil, flatten } from '../util';
import { Airport, Route, loadAirportData, loadRouteData } from '../data';

export async function createApp() {
  const app = express();

  const airports = await loadAirportData();
  const routesDb = await loadRouteData();

  // Removing duplicate routes
  const routes = routesDb.reduce((accumulator, current) => {
    const isDuplicate = accumulator.some(item => item.source.id === current.source.id && item.destination.id === current.destination.id);
    if (!isDuplicate) {
      accumulator.push(current);
    }
    return accumulator;
  }, []);

  const airportsByCode = new Map<string, Airport>(
    flatten(airports.map((airport) => [
      airport.iata !== null ? [airport.iata.toLowerCase(), airport] as const : null,
      airport.icao !== null ? [airport.icao.toLowerCase(), airport] as const : null,
    ].filter(notNil)))
  );

  interface Node {
    airport: Airport;
    distanceFromSource: number;
    previousNode?: Node;
  }

  app.use(morgan('tiny'));

  app.get('/health', (_, res) => res.send('OK'));
  app.get('/airports/:code', (req, res) => {
    const code = req.params['code'];
    if (code === undefined) {
      return res.status(400).send('Must provide airport code');
    }

    const airport = airportsByCode.get(code.toLowerCase());
    if (airport === undefined) {
      return res.status(404).send('No such airport, please provide a valid IATA/ICAO code');
    }

    return res.status(200).send(airport);
  });

  // API endpoint to find all routes
  app.get('/routes', (req, res) => {
    return res.status(200).send(routes);
  });

  // API endpoint to find routes from source airport
  app.get('/routes/:source', (req, res) => {
    const source = req.params['source'];
    
    if (source === undefined) {
      return res.status(400).send('Must provide source airport');
    }
  
    const sourceAirport = airportsByCode.get(source.toLowerCase());

    const sourceRoutes = routes.filter((route) => route.source.id === sourceAirport.id);
    return res.status(200).send(sourceRoutes);
  })

  // API endpoint to find fastetst routes between 2 airports
  app.get('/routes/:source/:destination', (req, res) => {
    const source = req.params['source'];
    const destination = req.params['destination'];
    const maxStops = 3;
  
    if (source === undefined || destination === undefined) {
      return res.status(400).send('Must provide source and destination airports');
    }
  
    const sourceAirport = airportsByCode.get(source.toLowerCase());
    const destinationAirport = airportsByCode.get(destination.toLowerCase());
    if (sourceAirport === undefined || destinationAirport === undefined) {
      return res.status(404).send('No such airport, please provide a valid IATA/ICAO codes');
    }
    
    const findRoute = (sourceAirport: Airport, destinationAirport: Airport, maxDistance: number): Route[] => {
      const nodes = airports.map((airport) => ({
        airport,
        distanceFromSource: airport.id === sourceAirport.id ? 0 : Infinity,
        previousNode: null,
      }));

      const visited: Node[] = [];
    
      while (nodes.length > 0) {
        const currentNode = nodes.reduce((minNode, node) => node.distanceFromSource < minNode.distanceFromSource ? node : minNode);
    
        if (currentNode.airport.id === destinationAirport.id) {
          const route: Route[] = [];
          let prevNode = currentNode;
          while (prevNode.previousNode !== null) {
            const prevAirport = prevNode.previousNode.airport;
            const currAirport = prevNode.airport;
            const prevNodeRoute = routes.find((r) => r.source.id === prevAirport.id && r.destination.id === currAirport.id);
            if (!prevNodeRoute) {
              throw new Error(`Route not found from ${prevAirport.id} to ${currAirport.id}`);
            }
            route.unshift(prevNodeRoute);
            prevNode = prevNode.previousNode;
          }
          return route;
        }
    
        nodes.splice(nodes.indexOf(currentNode), 1);
        visited.push(currentNode);
        for (const route of routes) {
          if (route.source.id === currentNode.airport.id) {
            const adjacentAirport = route.destination;
            let adjacentNode = nodes.find((node) => node.airport.id === adjacentAirport.id);
            if (!adjacentNode) {
              const newAdjacentNode = { airport: adjacentAirport, distanceFromSource: Infinity, previousNode: null };
              nodes.push(newAdjacentNode);
              if (currentNode.distanceFromSource + route.distance < maxDistance) {
                adjacentNode = newAdjacentNode;
              } else {
                continue;
              }
            }

            const newDistanceFromSource = currentNode.distanceFromSource + route.distance;
            if (newDistanceFromSource < adjacentNode.distanceFromSource) {
              adjacentNode.distanceFromSource = newDistanceFromSource;
              adjacentNode.previousNode = currentNode;
            }
          }
        }
      }
    
      return null;
    };

    const routeResult = findRoute(sourceAirport, destinationAirport, maxStops);

    if (!routeResult) {
      return res.status(404).send(`No valid route found between ${source} to ${destination}`);
    }

    const totalDistance = routeResult.reduce((sum, route) => sum + route.distance, 0);
    const hops = routeResult.map((route) => route.source.iata);
    hops.push(routeResult[routeResult.length - 1].destination.iata);
  
    return res.status(200).send({
      source: sourceAirport.iata || sourceAirport.icao,
      destination: destinationAirport.iata || destinationAirport.icao,
      distance: totalDistance,
      hops: hops,
      routes: routeResult
    });
  });

  return app;
}
