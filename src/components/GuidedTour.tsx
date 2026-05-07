import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, X, Sparkles, Search, History, User } from 'lucide-react';

interface TourStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  selector?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Bienvenue sur IBarka Travel",
    description: "Votre nouvelle façon de voyager sereinement au Burkina Faso. Laissez-nous vous montrer les fonctionnalités clés.",
    icon: <Sparkles className="w-8 h-8 text-primary" />,
  },
  {
    title: "Recherche Dynamique",
    description: "Trouvez votre trajet instantanément. Tapez votre départ et votre arrivée, les résultats s'actualisent en temps réel.",
    icon: <Search className="w-8 h-8 text-primary" />,
    selector: "#search-section"
  },
  {
    title: "Suggestions IA",
    description: "Besoin d'inspiration ? Notre IA analyse le réseau pour vous suggérer des destinations populaires.",
    icon: <Sparkles className="w-8 h-8 text-primary" />,
    selector: "#ai-suggestions"
  },
  {
    title: "Historique & Billets",
    description: "Retrouvez tous vos anciens voyages et vos billets actifs en un clic dans l'onglet historique.",
    icon: <History className="w-8 h-8 text-primary" />,
    selector: "#nav-history"
  },
  {
    title: "Votre Profil",
    description: "Gérez vos informations personnelles et votre compte en toute sécurité ici.",
    icon: <User className="w-8 h-8 text-primary" />,
    selector: "#nav-profile"
  }
];

export default function GuidedTour() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem('hasSeenTour');
    if (!hasSeenTour) {
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(curr => curr + 1);
    } else {
      completeTour();
    }
  };

  const completeTour = () => {
    setIsVisible(false);
    localStorage.setItem('hasSeenTour', 'true');
  };

  const step = TOUR_STEPS[currentStep];

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl"
          >
            <div className="p-8 space-y-6">
              <div className="flex justify-between items-start">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
                  {step.icon}
                </div>
                <button 
                  onClick={completeTour}
                  className="p-2 hover:bg-slate-50 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{step.title}</h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">
                  {step.description}
                </p>
              </div>

              <div className="flex items-center justify-between pt-4">
                <div className="flex gap-1.5">
                  {TOUR_STEPS.map((_, idx) => (
                    <div 
                      key={idx}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        idx === currentStep ? 'w-6 bg-primary' : 'w-1.5 bg-slate-200'
                      }`}
                    />
                  ))}
                </div>
                
                <button
                  onClick={handleNext}
                  className="px-6 py-3 bg-primary text-white rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-[1.05] active:scale-[0.95] transition-all"
                >
                  {currentStep === TOUR_STEPS.length - 1 ? 'C\'est parti !' : 'Suivant'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Context indicator for step if selector exists */}
            {step.selector && (
              <div className="bg-slate-50 p-4 flex items-center gap-3 border-t border-slate-100">
                <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  Découvrez cette option dans l'interface
                </p>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
