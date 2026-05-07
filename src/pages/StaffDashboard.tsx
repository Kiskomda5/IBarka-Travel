import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, getDocs, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Trip, Bus, Company } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Bus as BusIcon, Plus, Calendar, Clock, MapPin, TrendingUp, Users, DollarSign, Wallet, Loader2, LayoutDashboard, Package, Tag, Trash2, AlertTriangle, ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react';
import { format, subDays, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';

export default function StaffDashboard({ onNavigate }: { onNavigate?: (view: string) => void }) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [ticketCount, setTicketCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAddTrip, setShowAddTrip] = useState(false);
  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Form State
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [price, setPrice] = useState('');
  const [busId, setBusId] = useState('');
  const [distanceKm, setDistanceKm] = useState('');

  useEffect(() => {
    // For this demo, we assume the staff belongs to a specific company
    const companyId = 'COMPANY-001'; 

    const tripsRef = collection(db, 'trips');
    const tripsQuery = query(tripsRef, where('companyId', '==', companyId), orderBy('departureTime', 'desc'));
    
    const busRef = collection(db, 'buses');
    const busQuery = query(busRef, where('companyId', '==', companyId));

    const unsubTrips = onSnapshot(tripsQuery, (snapshot) => {
      setTrips(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Trip[]);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'trips'));

    const unsubBuses = onSnapshot(busQuery, (snapshot) => {
      setBuses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Bus[]);
    });

    const unsubAllTrips = onSnapshot(collection(db, 'trips'), (snapshot) => {
      setAllTrips(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Trip[]);
    });

    const unsubCompanies = onSnapshot(collection(db, 'companies'), (snapshot) => {
      setCompanies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Company[]);
    });

    const ticketQuery = query(collection(db, 'physicalTickets'), where('companyId', '==', companyId), where('status', '==', 'available'));
    const unsubTickets = onSnapshot(ticketQuery, (snapshot) => {
      setTicketCount(snapshot.size);
    });

    return () => { unsubTrips(); unsubBuses(); unsubTickets(); unsubAllTrips(); unsubCompanies(); };
  }, []);

  const handleAddTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedBus = buses.find(b => b.id === busId);
    if (!selectedBus) return;

    try {
      await addDoc(collection(db, 'trips'), {
        companyId: 'COMPANY-001',
        busId,
        from,
        to,
        departureTime: new Date(departureTime),
        price: Number(price),
        distanceKm: Number(distanceKm),
        status: 'scheduled',
        availableSeats: selectedBus.capacity,
        totalSeats: selectedBus.capacity,
        reservedSeats: [],
        createdAt: serverTimestamp(),
      });
      setShowAddTrip(false);
      setFrom(''); setTo(''); setPrice(''); setDepartureTime(''); setDistanceKm('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'trips');
    }
  };

  const handleDuplicateTrip = (trip: Trip) => {
    setFrom(trip.from);
    setTo(trip.to);
    setPrice(trip.price.toString());
    setBusId(trip.busId);
    setDistanceKm(trip.distanceKm?.toString() || '');
    // Departure time is usually different so we don't pre-fill it or we set it to current
    setDepartureTime('');
    setShowAddTrip(true);
  };

  const handleDeleteTrip = async () => {
    if (!tripToDelete) return;
    setIsDeleting(true);

    try {
      await deleteDoc(doc(db, 'trips', tripToDelete.id));
      setTripToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `trips/${tripToDelete.id}`);
      alert("Erreur lors de la suppression du trajet.");
    } finally {
      setIsDeleting(false);
    }
  };

  const totalPages = Math.ceil(trips.length / itemsPerPage);
  const paginatedTrips = trips.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Revenue Data for Chart
  const revenueData = React.useMemo(() => {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = subDays(new Date(), 29 - i);
      return {
        date: format(date, 'dd/MM'),
        dateObj: date,
        revenue: 0,
      };
    });

    trips.forEach(trip => {
      if (trip.departureTime?.toDate) {
        const tripDate = trip.departureTime.toDate();
        const start = startOfDay(subDays(new Date(), 29));
        const end = endOfDay(new Date());

        if (isWithinInterval(tripDate, { start, end })) {
          const dayIndex = last30Days.findIndex(d => 
            format(d.dateObj, 'yyyy-MM-dd') === format(tripDate, 'yyyy-MM-dd')
          );
          if (dayIndex !== -1) {
            const revenue = (trip.totalSeats - trip.availableSeats) * trip.price;
            last30Days[dayIndex].revenue += revenue;
          }
        }
      }
    });

    return last30Days;
  }, [trips]);

  const totalMonthlyRevenue = revenueData.reduce((acc, curr) => acc + curr.revenue, 0);

  // Revenue by Company Data for Chart
  const companyRevenueData = React.useMemo(() => {
    const revenueMap: Record<string, { name: string, revenue: number }> = {};
    
    // Initialize with all companies
    companies.forEach(company => {
      revenueMap[company.id] = { name: company.name, revenue: 0 };
    });

    const start = startOfDay(subDays(new Date(), 29));
    const end = endOfDay(new Date());

    allTrips.forEach(trip => {
      if (trip.departureTime?.toDate) {
        const tripDate = trip.departureTime.toDate();
        if (isWithinInterval(tripDate, { start, end })) {
          const revenue = (trip.totalSeats - trip.availableSeats) * trip.price;
          if (revenueMap[trip.companyId]) {
            revenueMap[trip.companyId].revenue += revenue;
          } else if (trip.companyName) {
            // Fallback for companies not in the list but present in trips
            revenueMap[trip.companyId] = { name: trip.companyName, revenue };
          }
        }
      }
    });

    return Object.values(revenueMap).sort((a, b) => b.revenue - a.revenue);
  }, [allTrips, companies]);

  const COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b'];

  const stats = [
    { label: "Recettes (30j)", value: `${totalMonthlyRevenue.toLocaleString()} FCFA`, icon: <DollarSign />, color: "bg-green-50 text-green-600" },
    { label: "Voyageurs", value: "1,240", icon: <Users />, color: "bg-blue-50 text-blue-600" },
    { label: "Tickets en Stock", value: ticketCount.toString(), icon: <Tag />, color: ticketCount < 50 ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600" },
    { label: "Départs Prévus", value: trips.length.toString(), icon: <Calendar />, color: "bg-orange-50 text-orange-600" },
    { label: "Parc Mobile", value: buses.length.toString(), icon: <BusIcon />, color: "bg-purple-50 text-purple-600" },
  ];

  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-orange-600" /></div>;

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Mini Sidebar */}
      <aside className="lg:w-64 shrink-0 space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Navigation Staff</p>
          </div>
          <nav className="p-2 space-y-1">
            <button className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-primary bg-primary/5 rounded-lg text-left">
              <LayoutDashboard className="w-4 h-4" />
              Vue d'ensemble
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-400 hover:bg-slate-50 hover:text-slate-600 rounded-lg transition-all text-left">
              <BusIcon className="w-4 h-4" />
              Gestion du Parc
            </button>
            <button 
              onClick={() => onNavigate?.('inventory')}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-400 hover:bg-slate-50 hover:text-slate-600 rounded-lg transition-all text-left"
            >
              <Package className="w-4 h-4" />
              Inventaire Tickets
            </button>
            <button onClick={() => setShowAddTrip(true)} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-400 hover:bg-slate-50 hover:text-slate-600 rounded-lg transition-all text-left">
              <Plus className="w-4 h-4" />
              Nouveau Trajet
            </button>
          </nav>
        </div>

        <div className="bg-primary rounded-xl p-6 text-white shadow-lg relative overflow-hidden hidden lg:block">
           <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
           <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 underline decoration-secondary">Besoin d'aide ?</p>
           <p className="text-sm font-bold mb-4">Support technique disponible 24/7</p>
           <button className="w-full py-2 bg-white text-primary text-[10px] font-black uppercase tracking-widest rounded transition-colors">
             Contacter
           </button>
        </div>
      </aside>

      <div className="flex-1 space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white p-6 rounded-xl shadow-sm border border-slate-200"
            >
              <div className="flex justify-between items-start mb-4">
                <div className={`p-2 rounded-lg ${stat.color}`}>
                  {React.cloneElement(stat.icon as React.ReactElement, { size: 18 })}
                </div>
                {i < 2 && <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">+12%</span>}
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{stat.label}</p>
              <p className="text-2xl font-black text-slate-800 tracking-tight">{stat.value.split(' ')[0]}<span className="text-xs font-bold text-slate-400 ml-1">{stat.value.split(' ')[1] || ''}</span></p>
            </motion.div>
          ))}
        </div>

        {/* Revenue Chart */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <div>
               <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest leading-none">Revenus des 30 derniers jours</h3>
               <p className="text-[10px] font-medium text-slate-400 mt-1 italic uppercase tracking-wider">Visualisation de la performance financière</p>
            </div>
            <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-sm">
               <TrendingUp className="w-4 h-4 text-green-600" />
            </div>
          </div>
          <div className="p-8 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                  tickFormatter={(value) => `${(value / 1000)}k`}
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}
                  formatter={(value: number) => [`${value.toLocaleString()} FCFA`, 'Recettes']}
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#f97316" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorRevenue)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Company Revenue Comparison */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <div>
               <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest leading-none">Performance par Compagnie</h3>
               <p className="text-[10px] font-medium text-slate-400 mt-1 italic uppercase tracking-wider">Revenus cumulés sur les 30 derniers jours</p>
            </div>
            <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-sm">
               <BarChart3 className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <div className="p-8 h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={companyRevenueData} layout="vertical" margin={{ left: 40, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                  tickFormatter={(value) => `${(value / 1000)}k`}
                />
                <YAxis 
                  dataKey="name" 
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  width={100}
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}
                  formatter={(value: number) => [`${value.toLocaleString()} FCFA`, 'Recettes']}
                />
                <Bar 
                  dataKey="revenue" 
                  radius={[0, 4, 4, 0]}
                  barSize={20}
                >
                  {companyRevenueData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Trips List */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <div>
               <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest leading-none">Planification des départs</h3>
               <p className="text-[10px] font-medium text-slate-400 mt-1 italic uppercase tracking-wider">Transport Excellence Faso</p>
            </div>
            <button onClick={() => setShowAddTrip(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-dark transition-all">
               <Plus className="w-3 h-3" />
               Ajouter
            </button>
          </div>

          {/* New Trip Modal Overlay */}
          {showAddTrip && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-xl rounded-2xl p-8 shadow-2xl space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest">Planifier un départ</h3>
                  <button onClick={() => setShowAddTrip(false)} className="text-slate-400 hover:text-slate-600 font-bold text-2xl">×</button>
                </div>
                
                <form onSubmit={handleAddTrip} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ville de Départ</label>
                      <input required value={from} onChange={e => setFrom(e.target.value)} type="text" className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-primary" placeholder="ex: Bobo" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ville d'Arrivée</label>
                      <input required value={to} onChange={e => setTo(e.target.value)} type="text" className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-primary" placeholder="ex: Ouaga" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Date & Heure</label>
                      <input required value={departureTime} onChange={e => setDepartureTime(e.target.value)} type="datetime-local" className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-primary" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Prix (FCFA)</label>
                      <input required value={price} onChange={e => setPrice(e.target.value)} type="number" className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-primary" placeholder="ex: 10000" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Distance (KM)</label>
                      <input required value={distanceKm} onChange={e => setDistanceKm(e.target.value)} type="number" className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-primary" placeholder="ex: 360" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Choisir un bus disponible</label>
                    <select required value={busId} onChange={e => setBusId(e.target.value)} className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-primary appearance-none">
                      <option value="">Sélectionner un bus</option>
                      {buses.map(bus => (
                        <option key={bus.id} value={bus.id}>{bus.plate} - {bus.capacity} places ({bus.comfort})</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button type="button" onClick={() => setShowAddTrip(false)} className="flex-1 h-12 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Annuler</button>
                    <button type="submit" className="flex-1 h-12 bg-primary text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-dark transition-all shadow-lg shadow-primary/20">Enregistrer le voyage</button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}

          {/* Delete Confirmation Modal */}
          <AnimatePresence>
            {tripToDelete && (
              <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }} 
                  animate={{ scale: 1, opacity: 1 }} 
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="bg-white w-full max-w-md rounded-2xl p-8 shadow-2xl text-center space-y-6"
                >
                  <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
                    <AlertTriangle size={32} />
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest">Confirmer la suppression</h3>
                    <p className="text-sm text-slate-500 font-medium">
                      Êtes-vous sûr de vouloir supprimer ce trajet ? Cette action est irréversible.
                    </p>
                    
                    <div className="bg-slate-50 p-4 rounded-xl space-y-3 text-left border border-slate-100">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Itinéraire</span>
                        <div className="flex items-center gap-2">
                           <span className="text-xs font-bold text-slate-700 uppercase">{tripToDelete.from}</span>
                           <span className="text-slate-300">➔</span>
                           <span className="text-xs font-bold text-slate-700 uppercase">{tripToDelete.to}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</span>
                        <span className="text-xs font-bold text-slate-700 capitalize">
                          {tripToDelete.departureTime?.toDate ? format(tripToDelete.departureTime.toDate(), 'eeee d MMMM yyyy', { locale: fr }) : '--'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Heure de Départ</span>
                        <span className="text-xs font-bold text-slate-700">
                          {tripToDelete.departureTime?.toDate ? format(tripToDelete.departureTime.toDate(), 'HH:mm') : '--:--'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button 
                      disabled={isDeleting}
                      onClick={() => setTripToDelete(null)} 
                      className="flex-1 h-12 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50"
                    >
                      Annuler
                    </button>
                    <button 
                      disabled={isDeleting}
                      onClick={handleDeleteTrip} 
                      className="flex-1 h-12 bg-red-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Supprimer
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">Trajet</th>
                  <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">Horaire</th>
                  <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">Occupation</th>
                  <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">Statut</th>
                  <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTrips.length === 0 ? (
                  <tr><td colSpan={5} className="p-20 text-center text-slate-400 font-medium italic">Aucun trajet programmé</td></tr>
                ) : paginatedTrips.map(trip => (
                  <tr key={trip.id} className="group hover:bg-slate-50 transition-colors">
                    <td className="px-8 py-5 border-b border-slate-50">
                      <div className="flex items-center gap-2">
                         <span className="font-bold text-slate-700 text-xs uppercase tracking-tight">{trip.from}</span>
                         <span className="text-slate-300">➔</span>
                         <span className="font-bold text-slate-700 text-xs uppercase tracking-tight">{trip.to}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-[10px] text-slate-400 font-bold">{trip.price.toLocaleString()} FCFA / place</p>
                        {trip.distanceKm && (
                          <>
                            <span className="text-slate-200 text-[10px]">•</span>
                            <p className="text-[10px] text-primary font-bold">{trip.distanceKm} KM</p>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-5 border-b border-slate-50">
                      <p className="font-black text-slate-800 text-sm">
                        {trip.departureTime?.toDate ? format(trip.departureTime.toDate(), 'HH:mm') : '--:--'}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                        {trip.departureTime?.toDate ? format(trip.departureTime.toDate(), 'd MMM', { locale: fr }) : '--'}
                      </p>
                    </td>
                    <td className="px-8 py-5 border-b border-slate-50">
                      <div className="flex items-center gap-3">
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${((trip.totalSeats - trip.availableSeats) / (trip.totalSeats || 1)) * 100}%` }} />
                        </div>
                        <span className="text-[11px] font-bold text-slate-700">{trip.totalSeats - trip.availableSeats}/{trip.totalSeats}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5 border-b border-slate-50">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                        trip.status === 'scheduled' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-50 text-slate-400 border-slate-100'
                      }`}>
                        {trip.status === 'scheduled' ? 'Planifié' : 'Terminé'}
                      </span>
                    </td>
                    <td className="px-8 py-5 border-b border-slate-50">
                      <div className="flex items-center gap-3">
                        <button className="text-[9px] font-black uppercase tracking-widest text-primary hover:underline">Détails</button>
                        <button 
                          onClick={() => handleDuplicateTrip(trip)}
                          className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-colors"
                        >
                          Dupliquer
                        </button>
                        <button 
                          onClick={() => setTripToDelete(trip)}
                          className="text-[9px] font-black uppercase tracking-widest text-red-400 hover:text-red-600 transition-colors"
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Page {currentPage} sur {totalPages} — {trips.length} trajets au total
              </p>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {[...Array(totalPages)].map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${
                      currentPage === i + 1 
                        ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                        : 'text-slate-400 hover:bg-white hover:text-slate-600 border border-transparent hover:border-slate-200'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button 
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
