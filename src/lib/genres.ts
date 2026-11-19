/** The headline genres shown on Discover and in the genre passport. */
export const GENRES = ["Action", "Fantasy", "Romance", "Comedy", "Drama", "Isekai", "Martial Arts", "Psychological", "Horror", "Sci-Fi", "Slice of Life", "Mystery", "Sports", "Thriller"];

export const genreKey = (g: string) => g.trim().toLowerCase().replace(/[\s_-]+/g, " ");
export const genrePath = (g: string) => `/discover?tag=${encodeURIComponent(g)}`;
