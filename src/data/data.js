const movies = [
  {
    id: 1,
    title: 'Avengers: Endgame',
    genre: ['Action', 'Adventure', 'Sci-Fi'],
    language: 'English',
    duration: '3h 1m',
    rating: 8.9,
    releaseDate: '2019-04-26',
    certificate: 'UA',
    price: 220,
    poster: 'https://image.tmdb.org/t/p/w500/or06FN3Dka5tukK1e9sl16pB3iy.jpg',
    banner:
      'https://image.tmdb.org/t/p/original/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg',
    description:
      "The Avengers assemble one final time to reverse Thanos' actions and restore balance to the universe.",
    showTimings: ['10:00 AM', '1:30 PM', '5:00 PM', '9:00 PM'],
  },
  {
    id: 2,
    title: 'Spider-Man: No Way Home',
    genre: ['Action', 'Adventure'],
    language: 'English',
    duration: '2h 28m',
    rating: 8.5,
    releaseDate: '2021-12-17',
    certificate: 'UA',
    price: 200,
    poster: 'https://image.tmdb.org/t/p/w500/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg',
    banner:
      'https://image.tmdb.org/t/p/original/iQFcwSGbZXMkeyKrxbPnwnRo5fl.jpg',
    description:
      "Spider-Man seeks Doctor Strange's help after his identity is revealed.",
    showTimings: ['11:00 AM', '2:00 PM', '6:00 PM', '9:30 PM'],
  },
  {
    id: 3,
    title: 'The Dark Knight',
    genre: ['Action', 'Crime'],
    language: 'English',
    duration: '2h 32m',
    rating: 9.0,
    releaseDate: '2008-07-18',
    certificate: 'UA',
    price: 180,
    poster: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
    banner:
      'https://image.tmdb.org/t/p/original/hZkgoQYus5vegHoetLkCJzb17zJ.jpg',
    description:
      'Batman faces his greatest challenge when the Joker spreads chaos across Gotham.',
    showTimings: ['9:30 AM', '12:30 PM', '4:00 PM', '8:00 PM'],
  },
  {
    id: 4,
    title: 'Interstellar',
    genre: ['Sci-Fi', 'Adventure'],
    language: 'English',
    duration: '2h 49m',
    rating: 8.7,
    releaseDate: '2014-11-07',
    certificate: 'U',
    price: 210,
    poster: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    banner:
      'https://image.tmdb.org/t/p/original/rAiYTfKGqDCRIIqo664sY9XZIvQ.jpg',
    description:
      'A team of explorers travels through a wormhole in search of a new home for humanity.',
    showTimings: ['10:30 AM', '2:00 PM', '5:30 PM', '9:00 PM'],
  },
  {
    id: 5,
    title: 'Joker',
    genre: ['Crime', 'Drama'],
    language: 'English',
    duration: '2h 2m',
    rating: 8.4,
    releaseDate: '2019-10-04',
    certificate: 'A',
    price: 190,
    poster: 'https://image.tmdb.org/t/p/w500/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg',
    banner:
      'https://image.tmdb.org/t/p/original/n6bUvigpRFqSwmPp1m2YADdbRBc.jpg',
    description:
      "Arthur Fleck's descent into madness transforms him into the Joker.",
    showTimings: ['11:30 AM', '3:00 PM', '7:00 PM', '10:00 PM'],
  },
];

export default movies;
