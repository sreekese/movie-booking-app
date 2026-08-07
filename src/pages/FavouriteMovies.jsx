import Blurcircle from "../components/Blurcircle"
import MovieCard from "../components/MovieCard"
import movies from "../data/data"

const FavouriteMovies = () => {

  return movies.length > 0 ? (
    <div className="relative my-40 mb-60 px-6 md:px-16 lg:px-40 xl:px-44 overflow-hidden min-h-[80vh]">
        <Blurcircle top='150px' left='0'/>
        <Blurcircle bottom='50px' right='50px'/>
        <h1 className="text-lg font-medium my-4">Your Favourite Movies</h1>
        <div>
          <MovieCard/>
        </div>
    </div>
  ) : (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-3xl font-bold text-center">No Movies Available</h1>
    </div>
  )
}

export default FavouriteMovies