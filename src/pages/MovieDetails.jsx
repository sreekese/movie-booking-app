import { useEffect, useState } from "react";
import { useParams } from "react-router-dom"
import movies from "../data/data";
import Blurcircle from "../components/Blurcircle";
import { Heart, PlayCircleIcon, StarIcon } from "lucide-react";


const MovieDetails = () => {

  const {id} = useParams();
  const [show, setShow] = useState(null);

  const getShow = async() => {
    const show = movies.find((movie) => movie.id === Number(id));

    setShow({
      movie:show,
      datetime:show.showTimings
    })
  }

  console.log(show);

  useEffect(() => {
    getShow()
  },[id]);

  return show ?  (
    <div className="px-6 md:px-16 lg:px-40 pt-30 md:pt-30">
      <div className="flex flex-col md:flex-row gap-8 max-w-6xl mx-auto">
        <img src={show.movie.poster} alt="" className="max-md:mx-auto rounded-xl h-104 max-w-70 object-cover"/>
        <div className="relative flex flex-col gap-3">
          <Blurcircle top='-100px' left='-100px'/>
          <p className="text-primary">English</p>
          <h1 className="text-4xl font-semibold max-w-96 text-balance">{show.movie.title}</h1>
          <div className="flex items-center gap-2 text-gray-300">
            <StarIcon className="w-5 h-5 text-primary fill-primary"/>
            User Rating
          </div>
          <p>
            {show.movie.overview}
          </p>
          <p></p>
          <div className="flex items-center flex-wrap mt-4 gap-5">
            <button className="flex items-center gap-2 px-7 py-3 text-sm bg-gray-800 hover:bg-gray-900 transition rounded-md font-medium cursor-pointer active:scale-95">
              <PlayCircleIcon className={`w-5 h-5`}/>
              Watch trailer
            </button>
            <a href="" className="px-10 py-3 text-sm bg-primary hover:bg-primary-dull transition rounded-md font-medium cursor-pointer active:scale-95">Buy Ticket</a>
            <button className="bg-gray-700 p-2.5 rounded-full transition cursor-pointer active:scale-95">
              <Heart className={`w-5 h-5`}/>
            </button>
        </div>
        </div>
      </div>

      <p>Your favourite Cast</p>
      <div className="overflow-x-auto no-scrollbar mt-8 pb-4">
        <div className="flex items-center gap-4 w-max px-4">

        </div>

      </div>

    </div>
  ) : (
    <div>
      <h1>Loading...</h1>
    </div>
  )
}

export default MovieDetails