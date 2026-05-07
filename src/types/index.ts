export type UserRole = 'passenger' | 'agent' | 'admin';

export interface UserProfile {
  uid: string;
  name: string;
  phone: string;
  role: UserRole;
  matricule?: string;
  createdAt: any;
}

export interface Company {
  id: string;
  name: string;
  logo?: string;
  contact?: string;
}

export interface Bus {
  id: string;
  companyId: string;
  plate: string;
  capacity: number;
  comfort: 'clim' | 'ventile';
}

export interface Trip {
  id: string;
  companyId: string;
  busId: string;
  from: string;
  to: string;
  departureTime: any;
  price: number;
  status: 'scheduled' | 'on_route' | 'completed' | 'cancelled';
  availableSeats: number;
  totalSeats: number;
  durationHours?: number;
  distanceKm?: number;
  reservedSeats?: string[];
  companyName?: string;
}

export interface Ticket {
  id: string;
  userId: string;
  tripId: string;
  companyId: string;
  from: string;
  to: string;
  seatNumber: string;
  passengerName: string;
  passengerPhone: string;
  qrCode: string;
  status: 'paid' | 'used' | 'cancelled';
  price: number;
  validatedBy?: string;
  physicalSerialNumber?: string;
  offlineValidatedAt?: string;
  createdAt: any;
  updatedAt?: any;
}

export interface Transaction {
  id: string;
  ticketId: string;
  userId: string;
  amount: number;
  provider: 'orange' | 'moov';
  reference: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: any;
}

export interface PhysicalTicket {
  id: string;
  companyId: string;
  serialNumber: string;
  batchId: string;
  status: 'available' | 'reserved' | 'used';
  assignedTicketId?: string;
  createdAt: any;
}

export interface TicketBatch {
  id: string;
  companyId: string;
  prefix: string;
  startNumber: number;
  endNumber: number;
  count: number;
  createdAt: any;
}
