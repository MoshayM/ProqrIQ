import React from 'react'
import { useParams } from 'react-router-dom'

export default function AssemblyDetail() {
  const { id } = useParams<{ id: string }>()
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900">Assembly Detail</h1>
      <p className="text-gray-500 mt-1">ID: {id}</p>
    </div>
  )
}
