import { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { UserProfile, UserRole } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { Bus, MapPin, Search, Ticket, User, LogOut, Loader2, QrCode, LayoutDashboard, History } from 'lucide-react';
import PassengerHome from './pages/PassengerHome';
import TripDetails from './pages/TripDetails';
import StaffDashboard from './pages/StaffDashboard';
import AgentScanner from './pages/AgentScanner';
import PassengerHistory from './pages/PassengerHistory';
import InventoryManagement from './pages/InventoryManagement';
import TransactionHistory from './pages/TransactionHistory';

import UserProfilePage from './pages/UserProfile';
import GuidedTour from './components/GuidedTour';

export default function App() {
  const [user, setUser] = useState(auth.currentUser);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'home' | 'trip-details' | 'dashboard' | 'scanner' | 'history' | 'inventory' | 'transaction-history' | 'profile'>('home');
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const docRef = doc(db, 'users', u.uid);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            // New user defaults to passenger
            const newProfile: Partial<UserProfile> = {
              uid: u.uid,
              name: u.displayName || 'Utilisateur',
              phone: '',
              role: 'passenger',
              createdAt: serverTimestamp(),
            };
            await setDoc(docRef, newProfile);
            setProfile(newProfile as UserProfile);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${u?.uid}`);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const ADMIN_EMAIL = 'kiskomda@gmail.com';
  const isAdmin = user?.email === ADMIN_EMAIL;

  const handleLogout = () => signOut(auth);

  const toggleRole = async () => {
    if (!profile || !user || !isAdmin) return;
    const nextRole: UserRole = profile.role === 'passenger' ? 'agent' : profile.role === 'agent' ? 'admin' : 'passenger';
    try {
      const docRef = doc(db, 'users', user.uid);
      const updates: any = { role: nextRole };
      if (nextRole === 'agent') updates.matricule = 'AGT-' + user.uid.slice(0, 4).toUpperCase();
      await setDoc(docRef, updates, { merge: true });
      setProfile({ ...profile, ...updates });
    } catch (e) {
      console.error(e);
    }
  };

  const seedData = async () => {
    try {
      // 1. Create Company
      const companyId = 'COMPANY-001';
      await setDoc(doc(db, 'companies', companyId), {
        name: 'Transport Excellence',
        contact: '+226 25 30 00 00',
        createdAt: serverTimestamp()
      });

      // 2. Create Buses
      const buses = [
        { plate: '11-JJ-1234', capacity: 44, comfort: 'clim' },
        { plate: '11-JJ-5678', capacity: 44, comfort: 'ventile' },
      ];
      for (const b of buses) {
        const busId = `BUS-${b.plate.replace(/-/g, '')}`;
        await setDoc(doc(db, 'buses', busId), {
          ...b,
          companyId,
          createdAt: serverTimestamp()
        });
      }

      // 3. Create a default Trip
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(7, 30, 0, 0);

      await setDoc(doc(db, 'trips', 'TRIP-DEMO-001'), {
        companyId,
        busId: 'BUS-11JJ1234',
        from: 'Bobo-Dioulasso',
        to: 'Ouagadougou',
        departureTime: tomorrow,
        price: 10000,
        status: 'scheduled',
        availableSeats: 44,
        reservedSeats: [],
        createdAt: serverTimestamp()
      });

      alert("Données de démonstration initialisées !");
    } catch (e) {
      console.error("Seeding failed", e);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-white">
        <Loader2 className="w-10 h-10 animate-spin text-orange-600" />
        <p className="mt-4 text-gray-500 font-medium">Chargement de IBarka Travel...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-[32px] p-10 shadow-sm border border-gray-100 flex flex-col items-center"
        >
          <div className="w-20 h-20 bg-orange-100 rounded-3xl flex items-center justify-center mb-6">
            <Bus className="w-10 h-10 text-orange-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">IBarka Travel</h1>
          <p className="text-gray-500 text-center mb-8">
            Réservez vos places de bus en toute simplicité au Burkina Faso.
          </p>
          <button
            onClick={handleLogin}
            className="w-full py-4 bg-orange-600 text-white rounded-2xl font-semibold hover:bg-orange-700 transition-colors flex items-center justify-center gap-3"
          >
            Se connecter avec Google
          </button>
          <p className="mt-6 text-xs text-center text-gray-400 leading-relaxed">
            En continuant, vous acceptez nos conditions d'utilisation et notre politique de confidentialité.
          </p>
        </motion.div>
      </div>
    );
  }

  const renderContent = () => {
    switch (view) {
      case 'home':
        return <PassengerHome onSelectTrip={(id) => { setSelectedTripId(id); setView('trip-details'); }} />;
      case 'trip-details':
        return selectedTripId ? (
          <TripDetails 
            tripId={selectedTripId} 
            onBack={() => setView('home')} 
            onSuccess={() => setView('history')}
          />
        ) : <PassengerHome 
            onSelectTrip={(id) => { setSelectedTripId(id); setView('trip-details'); }} 
            onNavigate={(v: any) => setView(v)}
          />;
      case 'dashboard':
        return isAdmin ? <StaffDashboard onNavigate={(v: any) => setView(v)} /> : <PassengerHome onSelectTrip={(id) => { setSelectedTripId(id); setView('trip-details'); }} />;
      case 'scanner':
        return isAdmin ? <AgentScanner /> : <PassengerHome onSelectTrip={(id) => { setSelectedTripId(id); setView('trip-details'); }} />;
      case 'inventory':
        return isAdmin ? <InventoryManagement /> : <PassengerHome onSelectTrip={(id) => { setSelectedTripId(id); setView('trip-details'); }} />;
      case 'transaction-history':
        return <TransactionHistory onBack={() => setView('home')} />;
      case 'history':
        return <PassengerHistory onSelectTrip={(id) => { setSelectedTripId(id); setView('trip-details'); }} />;
      case 'profile':
        return profile ? <UserProfilePage profile={profile} onUpdate={(p) => setProfile(p)} /> : null;
      default:
        return <PassengerHome onSelectTrip={(id) => { setSelectedTripId(id); setView('trip-details'); }} />;
    }
  };

  return (
    <div className="min-h-screen bg-surface pb-24">
      <GuidedTour />
      {/* Header */}
      <header className="bg-primary h-16 flex items-center justify-between px-8 border-b-4 border-secondary sticky top-0 z-50 shadow-md">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('home')}>
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center font-bold text-primary text-xl">
            BF
          </div>
          <span className="text-white font-bold text-lg tracking-tight">
            FasoTrans <span className="font-light opacity-80 underline decoration-accent">Solutions</span>
          </span>
        </div>
        <div className="flex items-center gap-6">
          {isAdmin && (
            <div className="hidden sm:flex bg-dark rounded-full p-1 h-fit">
              <button 
                onClick={() => profile?.role !== 'passenger' && toggleRole()}
                className={`px-4 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full transition-all ${profile?.role === 'passenger' ? 'bg-white text-primary' : 'text-white/60 hover:text-white'}`}
              >
                Passager
              </button>
              <button 
                onClick={() => profile?.role !== 'agent' && toggleRole()}
                className={`px-4 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full transition-all ${profile?.role === 'agent' ? 'bg-white text-primary' : 'text-white/60 hover:text-white'}`}
              >
                Agent
              </button>
            </div>
          )}
          
          <div className="h-8 w-px bg-white/20 hidden sm:block"></div>

          <div className="flex items-center gap-3">
            <div 
              className="text-right hidden sm:block cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setView('profile')}
            >
              <p className="text-[10px] text-white/70 uppercase font-black tracking-widest">Connecté</p>
              <p className="text-sm text-white font-medium">{profile?.name}</p>
            </div>
            <button 
              onClick={seedData} 
              className="p-2 text-white/60 hover:text-white transition-colors"
              title="Initialiser les données"
            >
              <LayoutDashboard className="w-4 h-4" />
            </button>
            <button onClick={handleLogout} className="p-2 text-white/60 hover:text-accent transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Navigation Bar (Mobile / Bottom) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-8 py-4 flex justify-around items-center z-50">
        <NavButton 
          active={view === 'home' || view === 'trip-details'} 
          icon={<Search className="w-6 h-6" />} 
          label="Recherche" 
          onClick={() => setView('home')} 
        />
        <NavButton 
          id="nav-history"
          active={view === 'history'} 
          icon={<History className="w-6 h-6" />} 
          label="Billets" 
          onClick={() => setView('history')} 
        />
        
        {isAdmin && profile?.role !== 'passenger' && (
          <NavButton 
            active={view === 'dashboard'} 
            icon={<LayoutDashboard className="w-6 h-6" />} 
            label="Gestion" 
            onClick={() => setView('dashboard')} 
          />
        )}
        
        {isAdmin && profile?.role === 'agent' && (
          <NavButton 
            active={view === 'scanner'} 
            icon={<QrCode className="w-6 h-6" />} 
            label="Scanner" 
            onClick={() => setView('scanner')} 
          />
        )}
        
        <NavButton 
          id="nav-profile"
          active={view === 'profile'} 
          icon={<User className="w-6 h-6" />} 
          label="Profil" 
          onClick={() => setView('profile')} 
        />
      </nav>
    </div>
  );
}

function NavButton({ id, active, icon, label, onClick }: { id?: string, active: boolean, icon: any, label: string, onClick: () => void }) {
  return (
    <button 
      id={id}
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 transition-all ${active ? 'text-orange-600 scale-110' : 'text-gray-400'}`}
    >
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}
