import * as express from 'express';
import * as morgan from 'morgan';

import { notNil, flatten } from '../util';
import { Airport, loadAirportData, loadRouteData } from '../data';

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

  app.get('/routes/:source/:destination', (req, res) => {
    const source = req.params['source'];
    const destination = req.params['destination'];
    if (source === undefined || destination === undefined) {
      return res.status(400).send('Must provide source and destination airports');
    }

    const sourceAirport = airportsByCode.get(source.toLowerCase());
    const destinationAirport = airportsByCode.get(destination.toLowerCase());
    if (sourceAirport === undefined || destinationAirport === undefined) {
      return res.status(404).send('No such airport, please provide a valid IATA/ICAO codes');
    }

    // TODO: Figure out the route from source to destination
    console.log('No algorithm implemented');

    return res.status(200).send({
      source,
      destination,
      distance: 0,
      hops: [],
    });
  });

  return app;
}
