export default function Home() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-gray-900">
          Town Hall Event Reports
        </h2>
        <p className="mt-2 text-gray-600">
          Scrape and review town hall events from California legislators.
        </p>
        <button className="mt-8 rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          Generate New Report
        </button>
      </div>
    </main>
  );
}
