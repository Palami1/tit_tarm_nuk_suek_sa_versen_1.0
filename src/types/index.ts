export type UserRole = 'intern' | 'admin' | 'superadmin';
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface Skill {
  name: string;
  percent: number;
  note?: string;
}

export interface FinalGrade {
  grade: string;
  proposedBy: string;
  proposedByName?: string;
  proposedAt?: string;
  proposedNote?: string;
  status?: 'pending_approval' | 'approved';
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
}

export interface UserProfile {
  uid: string;
  fullname: string;
  phone: string;
  email: string;
  photoURL?: string;
  college?: string;
  major?: string;
  startDate: string;
  endDate: string;
  role: UserRole;
  status: UserStatus;
  departmentId: string | null;
  supervisorId: string | null;
  skills?: Skill[];
  finalGrade?: FinalGrade | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Department {
  id: string;
  name: string;
  active: boolean;
  createdBy?: string;
  createdAt?: string;
}

export interface AttendanceRecord {
  id: string; // Format: {uid}_{YYYY-MM-DD}
  userId: string;
  userName: string;
  departmentId?: string | null;
  date: string; // YYYY-MM-DD
  checkInTime: string;
  checkInStatus: 'on-time' | 'late';
  checkInDistance: number;
  checkInCoords: { lat: number; lng: number };
  checkInAccuracy: number;
  checkOutTime: string | null;
  checkOutStatus: 'normal' | 'early-leave' | null;
  checkOutDistance: number | null;
  checkOutCoords: { lat: number; lng: number } | null;
  deviceInfo?: string;
  adjustedBy?: string | null;
  adjustedReason?: string | null;
  adjustedAt?: string | null;
}

export interface DailyReport {
  id: string; // Format: {uid}_{YYYY-MM-DD}
  userId: string;
  userName: string;
  date: string;
  report: string;
  adminComment: string | null;
  reviewStatus: 'pending' | 'approved' | 'needs-revision';
  reviewedBy: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface LeaveType {
  id: string;
  name: string; // e.g. "ລາພັກປະຈຳປີ", "ລາກິດທຸລະສ່ວນຕົວ", "ລາເຈັບປ່ວຍ", "ກິດທຸລະຂ້ອງການ"
  quotaPerYear: number | null; // null = ບໍ່ຈຳກັດ
  requiresDocument: boolean;
  active: boolean;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

export type LeavePeriod = 'morning' | 'afternoon' | 'both';

export interface LeaveAttachment {
  id?: string;
  requestId?: string;
  userId: string;
  fileName: string;
  fileType: string; // 'image/jpeg' | 'image/png' | 'application/pdf'
  fileSize: number; // <= 700KB (716800 bytes)
  base64Data: string;
  createdAt: string;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  departmentId: string | null;
  supervisorId: string | null;
  type?: 'leave' | 'remote'; // legacy backward compatibility
  leaveTypeId?: string;
  leaveTypeName?: string; // snapshot of type name
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  periods?: LeavePeriod; // 'morning' | 'afternoon' | 'both'
  days?: number; // e.g. 0.5, 1, 2...
  reason: string;
  hasAttachment?: boolean;
  attachmentId?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewedBy: string | null;
  reviewedByName?: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  cancelledBy?: string | null;
  cancelledReason?: string | null;
  cancelledAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface OfficeLocation {
  name: string;
  lat: number;
  lng: number;
  radius: number; // in meters (default 200)
  active: boolean;
}

export interface SystemSettings {
  offices: OfficeLocation[];
  workStart: string; // "08:00"
  workEnd: string; // "17:00"
  graceMinutes: number; // 0
  checkInWindow: { from: string; to: string }; // { from: "06:00", to: "12:00" }
  checkOutWindow: { from: string; to: string }; // { from: "12:00", to: "22:00" }
  lunchBreakHours: number; // 1
  lunchThresholdHours: number; // 5
  maxGpsAccuracy: number; // 50
  leaveApprovalBackdateDays: number; // 7
  gradeThresholds: { A: number; B: number; C: number; D: number };
  timezone: string; // "Asia/Vientiane"
  halfDay?: {
    morningLeave: {
      checkInWindow: { from: string; to: string }; // "06:00" to "16:00"
      checkInCutoff: string; // "13:00:00"
      checkOutCutoff: string; // "17:00:00"
    };
    afternoonLeave: {
      checkInCutoff: string; // "08:00:00"
      checkOutWindow: { from: string; to: string }; // "11:00" to "22:00"
      checkOutCutoff: string; // "12:00:00"
    };
  };
}

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  createdBy?: string;
}

export interface Certificate {
  userId: string;
  issuedBy: string;
  issuedAt: string;
  certificateNo: string;
  grade: string;
}

export interface AuditLog {
  id?: string;
  actorId: string;
  actorRole: UserRole;
  action: string;
  targetType: string;
  targetId: string;
  before?: any;
  after?: any;
  reason?: string;
  timestamp: any;
}
