
import { useNavigate } from 'react-router-dom'
import movies from '../data/data'
import { StarIcon } from 'lucide-react'


const MovieCard = () => {

    const navigate = useNavigate()

  return (
   <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6'>
     {movies.map((x,i) => <div key={i} className='flex flex-col justify-between p-3 bg-gray-800 rounded-2xl hover:-translate-y-1 transition duration-300 w-66'>
        <img onClick={() => {navigate(`/movies/${x.id}`);scrollTo(0,0)}} className='rounded-lg h-52 w-full object-cover object-bottom-right cursor-pointer' src={x.banner} alt={x.title}/>
        <p className='font-semibold mt-2 truncate'>{x.title}</p>
        <p className='text-sm text-gray-500 mt-2'>{x.genre.join(" | ")}</p>
        <div className='flex items-center justify-between mt-4 pb-3'>
          <button onClick={() => {navigate(`/movies/${x.id}`);scrollTo(0,0)}} className='px-4 py-2 text-xs bg-primary hover:bg-primary-dull transition rounded-full font-medium cursor-pointer'>Buy Tickets</button>
            <p className='flex items-center'><StarIcon className='w-4 h-4 fill-primary text-primary'/>
            {x.rating}
            </p>
        </div>
    </div>
    )}
   </div>
  )
}

export default MovieCard