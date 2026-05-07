import { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { db, auth } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { motion } from 'motion/react';
import { User, Mail, Phone, Shield, Calendar, Save, Loader2, LogOut, Trash2 } from 'lucide-react';
import { signOut } from 'firebase/auth';

interface UserProfilePageProps {
  profile: UserProfile;
  onUpdate: (updatedProfile: UserProfile) => void;
}

export default function UserProfilePage({ profile, onUpdate }: UserProfilePageProps) {
  const [name, setName] = useState(profile.name || '');
  const [phone, setPhone] = useState(profile.phone || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSave = async () => {
    if (!auth.currentUser) return;
    setSaving(true);
    setMessage(null);

    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const updates = {
        name,
        phone,
        updatedAt: serverTimestamp()
      };
      
      await updateDoc(userRef, updates);
      onUpdate({ ...profile, ...updates });
      setMessage({ type: 'success', text: 'Profil mis à jour avec succès !' });
    } catch (error) {
      console.error("Error updating profile:", error);
      setMessage({ type: 'error', text: 'Erreur lors de la mise à jour.' });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => signOut(auth);

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-black text-slate-800 tracking-tight uppercase tracking-[0.2em]">Mon Profil</h2>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Gestion de vos informations personnelles</p>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100 space-y-10"
      >
        {/* Header Section */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center border-2 border-primary/20">
            <User className="w-12 h-12 text-primary" />
          </div>
          <div className="text-center">
            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{profile.name}</h3>
            <div className="flex items-center gap-2 justify-center mt-1">
              <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                profile.role === 'admin' ? 'bg-red-100 text-red-600' : 
                profile.role === 'agent' ? 'bg-blue-100 text-blue-600' : 
                'bg-green-100 text-green-600'
              }`}>
                {profile.role === 'admin' ? 'Administrateur' : 
                 profile.role === 'agent' ? 'Agent de Gare' : 
                 'Passager'}
              </span>
              {profile.matricule && (
                <span className="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-[9px] font-black tracking-widest uppercase">
                  {profile.matricule}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Form Section */}
        <div className="grid gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nom Complet</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                placeholder="Votre nom"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Numéro de Téléphone</label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input 
                type="tel" 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                placeholder="Ex: +226 70 00 00 00"
              />
            </div>
          </div>

          <div className="space-y-2 opacity-60">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Email (Lecture seule)</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input 
                type="email" 
                value={auth.currentUser?.email || ''} 
                disabled 
                className="w-full pl-12 pr-4 py-4 bg-slate-100 border border-slate-100 rounded-2xl text-sm font-bold text-slate-500"
              />
            </div>
          </div>
        </div>

        {message && (
          <div className={`p-4 rounded-2xl text-xs font-bold text-center uppercase tracking-widest ${
            message.type === 'success' ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'
          }`}>
            {message.text}
          </div>
        )}

        <div className="flex flex-col gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Enregistrer les modifications
          </button>
          
          <div className="h-px bg-slate-100 w-full my-2" />
          
          <button
            onClick={handleLogout}
            className="w-full py-4 bg-white border-2 border-slate-100 text-slate-400 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-slate-50 hover:text-red-600 hover:border-red-100 transition-all"
          >
            <LogOut className="w-5 h-5" />
            Déconnexion
          </button>
        </div>
      </motion.div>

      <div className="bg-orange-50/50 p-6 rounded-[24px] border border-orange-100 flex items-start gap-4">
        <Shield className="w-6 h-6 text-orange-600 shrink-0 mt-1" />
        <div className="space-y-1">
          <p className="text-[10px] font-black text-orange-800 uppercase tracking-widest">Sécurité des données</p>
          <p className="text-xs text-orange-700/70 font-medium leading-relaxed">
            Vos informations personnelles sont stockées de manière sécurisée et ne sont utilisées que pour la gestion de vos réservations sur IBarka Travel.
          </p>
        </div>
      </div>
    </div>
  );
}
