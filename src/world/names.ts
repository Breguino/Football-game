/**
 * Name banks for the generated world.
 *
 * Everything here is invented. The registers are chosen so a league reads as
 * plausibly European or South American without any of it belonging to a real
 * club, competition or person. Club names come from a grammar rather than a
 * list, so the space is large enough that repeats are rare.
 */

export interface Nation {
  id: string;
  name: string;
  /** Three-letter code used on kits and squad lists. */
  code: string;
  /** Weighted share of players drawn from this nation in its own league. */
  home: number;
}

export const NATIONS: Nation[] = [
  { id: 'albion', name: 'Albion', code: 'ALB', home: 0.62 },
  { id: 'valenne', name: 'Valenne', code: 'VLN', home: 0.58 },
  { id: 'ostmark', name: 'Ostmark', code: 'OST', home: 0.6 },
  { id: 'catalva', name: 'Catalva', code: 'CTV', home: 0.55 },
  { id: 'nordvik', name: 'Nordvik', code: 'NDV', home: 0.66 },
  { id: 'brasa', name: 'Brasa', code: 'BRS', home: 0.2 },
  { id: 'rioplata', name: 'Rioplata', code: 'RPL', home: 0.18 },
  { id: 'kessane', name: 'Kessane', code: 'KSN', home: 0.16 },
];

/** Club-name grammar: [prefix] core [suffix], assembled per nation. */
interface NameGrammar {
  cores: string[];
  prefixes: string[];
  suffixes: string[];
}

export const CLUB_GRAMMAR: Record<string, NameGrammar> = {
  albion: {
    cores: [
      'Rothbury', 'Calder', 'Bexholt', 'Marlow', 'Thornwick', 'Ashcombe', 'Harrowgate',
      'Draymoor', 'Fenwick', 'Sandbourne', 'Kestrel Bay', 'Whitmoor', 'Aldercross',
      'Pennfield', 'Greyford', 'Halloway',
    ],
    prefixes: ['', '', '', '', 'Royal '],
    suffixes: [' United', ' Town', ' City', ' Rovers', ' Athletic', ' Wanderers', ' Albion', ' County'],
  },
  valenne: {
    cores: [
      'Cévennes', 'Montreuil', 'Aubrac', 'Saint-Vardan', 'Lorcy', 'Bellecour', 'Vaurance',
      'Ferrand', 'Quimperle', 'Ancenay', 'Rivaud', 'Montsalve', 'Dorlaine', 'Chaumery',
      'Vallonge', 'Perrigny',
    ],
    prefixes: ['AS ', 'FC ', 'Olympique ', 'RC ', 'Stade '],
    suffixes: ['', '', '', ' Sportif'],
  },
  ostmark: {
    cores: [
      'Hallstadt', 'Eisenberg', 'Wolfach', 'Brandhof', 'Neuretz', 'Königsau', 'Lindenthal',
      'Sturmfeld', 'Kaltenbach', 'Rheinau', 'Grünwald', 'Bergstett', 'Mühlental',
      'Oderstadt', 'Falkenau', 'Weissenfeld',
    ],
    prefixes: ['SV ', 'FC ', '1. FC ', 'SC ', 'TSV '],
    suffixes: ['', '', '', ' 04', ' 09', ' 1900'],
  },
  catalva: {
    cores: [
      'Alvedra', 'Montesol', 'Puerto Rialto', 'Sanlúcar', 'Villareal del Mar', 'Cordava',
      'Almenar', 'Tarrona', 'Beniforte', 'Riofrío', 'Castellón Vell', 'Marbelosa',
      'Andrada', 'Sierraverde', 'Elmonte', 'Vallcarca',
    ],
    prefixes: ['CD ', 'Real ', 'Atlético ', 'UD ', 'Sporting '],
    suffixes: ['', '', '', ' CF'],
  },
  nordvik: {
    cores: [
      'Nordvik', 'Sørhavn', 'Bjørnfjell', 'Kaldstrand', 'Vinterholm', 'Lysanger', 'Grimstad',
      'Hallvarden', 'Storøya', 'Ravnsund', 'Fjellheim', 'Tromsberg', 'Skarnes',
      'Ødegård', 'Blåvik', 'Ísafell',
    ],
    prefixes: ['', '', 'IF ', 'IK '],
    suffixes: [' BK', ' IF', ' FK', ' United', ''],
  },
  brasa: {
    cores: [
      'Serra Azul', 'Rio Verde', 'Palmares', 'Vila Nova do Sul', 'Catanduva', 'Ipanoré',
      'Barra Preta', 'Guaraçu', 'Ouro Fino', 'Marambaia', 'Tijucaré', 'Santa Ilha',
    ],
    prefixes: ['SC ', 'EC ', 'CR ', 'Grêmio '],
    suffixes: [' FC', '', '', ' Atlético'],
  },
  rioplata: {
    cores: [
      'Boca Larga', 'Río Sauce', 'Independencia del Plata', 'Almirante Vega', 'Talcahua',
      'San Feliciano', 'Puerto Norte', 'Lomas Verdes', 'El Cardal', 'Vieja Estación',
    ],
    prefixes: ['CA ', 'Club ', 'Racing ', 'Defensores de '],
    suffixes: [' Juniors', '', '', ' FC'],
  },
  kessane: {
    cores: [
      'Kessane', 'Bandaru', 'Port Nyali', 'Tamburra', 'Zafari', 'Adakwa', 'Mwenzi',
      'Sokota', 'Harrah Oasis', 'Ndogo',
    ],
    prefixes: ['', '', 'AS ', 'FC '],
    suffixes: [' FC', ' United', ' Stars', ''],
  },
};

/** Given and family names, per nation. Invented, not drawn from real people. */
export const PERSON_NAMES: Record<string, { first: string[]; last: string[] }> = {
  albion: {
    first: ['Alfie', 'Reece', 'Callum', 'Jude', 'Morgan', 'Elliot', 'Kai', 'Tomas', 'Rory', 'Dane', 'Wes', 'Ashley', 'Finn', 'Corey', 'Jonah', 'Bryn', 'Kieran', 'Milo', 'Sonny', 'Harvey', 'Ellis', 'Reuben'],
    last: ['Whitlock', 'Ferrers', 'Danby', 'Hollis', 'Marchett', 'Pike', 'Ashgrove', 'Renshaw', 'Balfour', 'Kettering', 'Sowerby', 'Vance', 'Loxley', 'Bramley', 'Crowther', 'Netherby', 'Slade', 'Fairhurst', 'Godwin', 'Tarrant', 'Ashby', 'Wrenfield', 'Coleridge', 'Pemberly', 'Halstead', 'Ingram'],
  },
  valenne: {
    first: ['Aurélien', 'Théo', 'Mathis', 'Noé', 'Ilan', 'Rémy', 'Corentin', 'Bastien', 'Yanis', 'Léandre', 'Gaspard', 'Marius', 'Enzo', 'Océan', 'Sacha', 'Amaury', 'Titouan', 'Hugo', 'Nolan', 'Balthazar'],
    last: ['Ferrant', 'Delacour', 'Rivoire', 'Bonnevie', 'Aubertin', 'Marchal', 'Vasseur', 'Lorrain', 'Chastel', 'Peyroux', 'Gaudin', 'Serval', 'Montclair', 'Beauregard', 'Tessier', 'Duplantis', 'Charbonneau', 'Roussel', 'Lemarque', 'Valcourt', 'Brissac', 'Naudin', 'Fontenay', 'Thibault'],
  },
  ostmark: {
    first: ['Jonas', 'Levin', 'Emil', 'Nico', 'Fabian', 'Lars', 'Moritz', 'Til', 'Anton', 'Jannik', 'Bennet', 'Rasmus', 'Kilian', 'Ole', 'Malte', 'Henrik', 'Joris', 'Silas', 'Tammo', 'Veit'],
    last: ['Kellner', 'Brandhof', 'Steinbach', 'Vogler', 'Reichert', 'Hauser', 'Lindqvist', 'Wernher', 'Ostermann', 'Falk', 'Neumeier', 'Ritter', 'Habicht', 'Grunwald', 'Sauerbeck', 'Dietloff', 'Mahlberg', 'Kranich', 'Eberhart', 'Zollner', 'Freitag', 'Waldstein', 'Krebs', 'Oderbrecht'],
  },
  catalva: {
    first: ['Iker', 'Nando', 'Álvar', 'Bruno', 'Marc', 'Pau', 'Sergi', 'Rubén', 'Xavi', 'Joel', 'Iñigo', 'Dani', 'Guillem', 'Adri', 'Nil', 'Oriol', 'Biel', 'Arnau', 'Hugo', 'Izan'],
    last: ['Alvedra', 'Requena', 'Carbonell', 'Montesol', 'Peláez', 'Vidaurre', 'Sanabria', 'Ferré', 'Olmedo', 'Bastida', 'Casals', 'Berenguer', 'Marimón', 'Escudé', 'Quintanar', 'Tellado', 'Ibarrola', 'Salvat', 'Doménech', 'Peñaranda', 'Corella', 'Bonastre', 'Villalta', 'Andrade'],
  },
  nordvik: {
    first: ['Sander', 'Emrik', 'Håkon', 'Vetle', 'Nils', 'Torbjørn', 'Kasper', 'Elias', 'Sindre', 'Jørgen', 'Aksel', 'Birk', 'Iver', 'Mathias', 'Odin', 'Sivert', 'Lucas', 'Theodor', 'Filip', 'Brage'],
    last: ['Halvorsen', 'Bjørnstad', 'Kaldheim', 'Sørgaard', 'Lysne', 'Ravnsund', 'Storøy', 'Vinther', 'Ødegård', 'Fjeldstad', 'Ísaksen', 'Nordbø', 'Vangen', 'Skarsgård', 'Hellesøy', 'Aukland', 'Grimsrud', 'Berdal', 'Tollefsen', 'Myrvang', 'Kvamme', 'Stangeland', 'Rypdal', 'Ålvik'],
  },
  brasa: {
    first: ['Ediveldo', 'Ruan', 'Caio', 'Vinícius', 'Matheus', 'Léo', 'Iago', 'Danilo', 'Wesley', 'Kauã', 'Juninho', 'Rômulo', 'Gabriel', 'Bruninho', 'Yuri', 'Everton', 'Rafinha', 'Douglas', 'Lucca', 'Alisson'],
    last: ['Palmares', 'do Vale', 'Tarrafa', 'Guaraçu', 'Nascimento Filho', 'Cavalcante', 'Maranhão', 'Serrão', 'Bittencourt', 'Peixoto', 'Marambaia', 'Ipanoré', 'Andradina', 'Queiroz', 'Vasconcelos', 'Tavares Lima', 'Bezerril', 'Monteiro', 'Sampaio', 'Rondon', 'Caiçara', 'Furtado', 'Alencar', 'Bulhões'],
  },
  rioplata: {
    first: ['Nahuel', 'Facundo', 'Lautaro', 'Tomás', 'Agustín', 'Julián', 'Franco', 'Valentín', 'Máximo', 'Ezequiel', 'Bruno', 'Thiago', 'Ignacio', 'Santino', 'Benjamín', 'Lisandro', 'Joaquín', 'Ramiro', 'Emiliano', 'Bautista'],
    last: ['Sauceda', 'Vergara', 'Almada', 'Quiroga', 'Belaunde', 'Otamendi Cruz', 'Talcahua', 'Ferreyra', 'Ledesma', 'Ocampos Rey', 'Zabala', 'Cardal', 'Iturralde', 'Barrionuevo', 'Peralta Ríos', 'Escalante', 'Villagra', 'Maidana', 'Sosa Vera', 'Bermúdez', 'Aguirre', 'Cantero', 'Rolón', 'Zenón'],
  },
  kessane: {
    first: ['Ibrahima', 'Kwesi', 'Amadou', 'Tendai', 'Selim', 'Obed', 'Zoumana', 'Rashid', 'Nuru', 'Baraka', 'Mensah', 'Jelani', 'Chidi', 'Sekou', 'Tafari', 'Malick', 'Bakary', 'Kofi', 'Yusuf', 'Idrissa'],
    last: ['Okonkwo', 'Diarra', 'Nyaguthii', 'Bandaru', 'Mwangi', 'Sesay', 'Adjei', 'Nkemelu', 'Zafari', 'Kalulu Sanne', 'Ouedraogo', 'Mbaye', 'Konaté', 'Achieng', 'Dembele', 'Nwachukwu', 'Traoré', 'Osei-Bonsu', 'Chikondi', 'Rugambwa', 'Fofana', 'Njoroge', 'Sankoh', 'Balogun'],
  },
};

export const LEAGUES: { id: string; name: string; nation: string; tier: number; strength: number }[] = [
  { id: 'albion-prem', name: 'Albion Premier Division', nation: 'albion', tier: 1, strength: 1.0 },
  { id: 'valenne-elite', name: 'Valenne Elite', nation: 'valenne', tier: 1, strength: 0.93 },
  { id: 'ostmark-liga', name: 'Ostmark Bundesliga', nation: 'ostmark', tier: 1, strength: 0.95 },
  { id: 'catalva-primera', name: 'Catalva Primera', nation: 'catalva', tier: 1, strength: 0.96 },
  { id: 'nordvik-allserien', name: 'Nordvik Allserien', nation: 'nordvik', tier: 1, strength: 0.8 },
  { id: 'albion-champ', name: 'Albion Championship', nation: 'albion', tier: 2, strength: 0.72 },
];

export const STADIUM_SUFFIXES = [
  'Park', 'Stadium', 'Arena', 'Ground', 'Field', 'Bowl', 'Stadion', 'Estadio',
];
