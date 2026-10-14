export const seatCategory = (row) =>
  row.category || (row.premium ? 'Premium' : 'Classic');
export const seatPrice = (row, movie) =>
  row.price ?? movie.price + (row.premium ? movie.premiumPrice : 0);
export const sameSeatGroup = (a, b, movie) =>
  !!a &&
  seatCategory(a) === seatCategory(b) &&
  seatPrice(a, movie) === seatPrice(b, movie);
