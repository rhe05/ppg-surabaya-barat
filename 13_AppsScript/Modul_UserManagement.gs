/**
 * Modul_UserManagement.gs — User Management CRUD & Admin Functions
 * Create, Read, Update, Delete users dengan RBAC enforcement
 */

/**
 * GET list users (dengan RBAC)
 * - Admin PPG: lihat semua users
 * - Admin Desa: lihat users di desa yang sama
 * - Admin Kelompok: lihat users di kelompok yang sama
 * - Guru: tidak bisa akses
 */
function serverGetUsersList(token, page = 1, limit = 50) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  // Only admin roles dapat akses
  if (!['admin_ppg', 'admin_desa', 'admin_kelompok'].includes(user.role)) {
    return { success: false, error: 'Anda tidak memiliki akses.' };
  }

  const usersData = readSheetAsObjects(SHEET_NAMES.USERS);
  let filtered = usersData;

  // Apply RBAC filters
  if (user.role === 'admin_desa') {
    filtered = filtered.filter(u => u.scope_type === 'desa' && u.scope_id == user.scopeId);
  } else if (user.role === 'admin_kelompok') {
    filtered = filtered.filter(u => u.scope_type === 'kelompok' && u.scope_id == user.scopeId);
  }

  // Pagination
  const start = (page - 1) * limit;
  const paged = filtered.slice(start, start + limit);

  return {
    success: true,
    data: paged,
    total: filtered.length,
    page,
    limit
  };
}

/**
 * GET user by ID (dengan RBAC)
 */
function serverGetUserById(token, userId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const usersData = readSheetAsObjects(SHEET_NAMES.USERS);
  const targetUser = usersData.find(u => u.id == userId);

  if (!targetUser) return { success: false, error: 'User tidak ditemukan.' };

  // Check RBAC
  if (user.role === 'admin_desa' && targetUser.scope_type !== 'desa') {
    return { success: false, error: 'Anda tidak memiliki akses ke user ini.' };
  }
  if (user.role === 'admin_kelompok' && targetUser.scope_type !== 'kelompok') {
    return { success: false, error: 'Anda tidak memiliki akses ke user ini.' };
  }

  return {
    success: true,
    data: {
      id: targetUser.id,
      nama: targetUser.nama,
      username: targetUser.username,
      email: targetUser.email || '',
      role: targetUser.role,
      scope_type: targetUser.scope_type,
      scope_id: targetUser.scope_id,
      status: targetUser.status || 'active',
      created_at: targetUser.created_at
    }
  };
}

/**
 * CREATE new user (admin only)
 */
function serverCreateUser(token, userData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  // Only admin_ppg dapat create semua role
  if (user.role === 'admin_desa') {
    // Admin desa hanya bisa create user untuk desa-nya
    if (userData.scope_type !== 'desa' || userData.scope_id != user.scopeId) {
      return { success: false, error: 'Anda hanya dapat membuat user untuk desa Anda.' };
    }
  } else if (user.role === 'admin_kelompok') {
    // Admin kelompok hanya bisa create user untuk kelompok-nya
    if (userData.scope_type !== 'kelompok' || userData.scope_id != user.scopeId) {
      return { success: false, error: 'Anda hanya dapat membuat user untuk kelompok Anda.' };
    }
  } else if (user.role !== 'admin_ppg') {
    return { success: false, error: 'Anda tidak memiliki akses.' };
  }

  // Validate input
  if (!userData.nama || !userData.username || !userData.email) {
    return { success: false, error: 'Nama, username, dan email wajib diisi.' };
  }

  // Check unique username & email
  const usersData = readSheetAsObjects(SHEET_NAMES.USERS);
  if (usersData.find(u => u.username === userData.username)) {
    return { success: false, error: 'Username sudah terdaftar.' };
  }
  if (usersData.find(u => u.email === userData.email)) {
    return { success: false, error: 'Email sudah terdaftar.' };
  }

  // Generate temporary password (8-char random)
  const tempPassword = generateTemporaryPassword();
  const passwordHash = hashPassword(tempPassword);

  const id = generateId(SHEET_NAMES.USERS);

  appendRowToSheet(SHEET_NAMES.USERS, [
    id,
    userData.nama,
    userData.username,
    passwordHash,
    userData.role || 'guru',
    userData.scope_type,
    userData.scope_id,
    userData.email,
    'active',
    new Date().toISOString().split('T')[0],
    new Date().toISOString().split('T')[0],
    user.id
  ]);

  return {
    success: true,
    message: `User ${userData.username} berhasil dibuat. Password sementara: ${tempPassword}`,
    data: { id, username: userData.username, tempPassword }
  };
}

/**
 * UPDATE user (admin only)
 */
function serverUpdateUser(token, userId, userData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const usersData = readSheetAsObjects(SHEET_NAMES.USERS);
  const targetUserIndex = usersData.findIndex(u => u.id == userId);

  if (targetUserIndex === -1) return { success: false, error: 'User tidak ditemukan.' };

  const targetUser = usersData[targetUserIndex];

  // Check RBAC
  if (user.role !== 'admin_ppg') {
    if (user.role === 'admin_desa' && targetUser.scope_type !== 'desa') {
      return { success: false, error: 'Anda tidak memiliki akses.' };
    }
    if (user.role === 'admin_kelompok' && targetUser.scope_type !== 'kelompok') {
      return { success: false, error: 'Anda tidak memiliki akses.' };
    }
  }

  // Validate unique email (if changed)
  if (userData.email && userData.email !== targetUser.email) {
    if (usersData.find((u, i) => i !== targetUserIndex && u.email === userData.email)) {
      return { success: false, error: 'Email sudah terdaftar.' };
    }
  }

  // Update fields
  const usersSheet = getSheetByName(SHEET_NAMES.USERS);
  const headerRow = 1;
  const userRow = targetUserIndex + headerRow + 1;

  if (userData.nama) usersSheet.getRange(userRow, 2).setValue(userData.nama);
  if (userData.email) usersSheet.getRange(userRow, 8).setValue(userData.email);
  if (userData.role) usersSheet.getRange(userRow, 5).setValue(userData.role);
  if (userData.status) usersSheet.getRange(userRow, 9).setValue(userData.status);
  usersSheet.getRange(userRow, 11).setValue(new Date().toISOString().split('T')[0]);

  return {
    success: true,
    message: `User ${targetUser.username} berhasil diupdate.`
  };
}

/**
 * DELETE user (soft delete: set status = inactive)
 */
function serverDeleteUser(token, userId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (user.role !== 'admin_ppg') {
    return { success: false, error: 'Hanya admin PPG yang dapat menghapus user.' };
  }

  const usersData = readSheetAsObjects(SHEET_NAMES.USERS);
  const targetUserIndex = usersData.findIndex(u => u.id == userId);

  if (targetUserIndex === -1) return { success: false, error: 'User tidak ditemukan.' };

  // Soft delete: set status = inactive
  const usersSheet = getSheetByName(SHEET_NAMES.USERS);
  const userRow = targetUserIndex + 2; // +2: header + index offset
  usersSheet.getRange(userRow, 9).setValue('inactive'); // status column

  return {
    success: true,
    message: 'User berhasil dihapus.'
  };
}

/**
 * CHANGE password (user change own password)
 */
function serverChangePassword(token, oldPassword, newPassword) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  // Verify old password
  const usersData = readSheetAsObjects(SHEET_NAMES.USERS);
  const userData = usersData.find(u => u.id == user.id);

  if (!userData) return { success: false, error: 'User tidak ditemukan.' };

  const oldPasswordHash = hashPassword(oldPassword);
  if (oldPasswordHash !== userData.password_hash) {
    return { success: false, error: 'Password lama tidak sesuai.' };
  }

  // Validate new password
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'Password baru minimal 6 karakter.' };
  }

  // Update password
  const newPasswordHash = hashPassword(newPassword);
  const usersSheet = getSheetByName(SHEET_NAMES.USERS);
  const userIndex = usersData.findIndex(u => u.id == user.id);
  const userRow = userIndex + 2;
  usersSheet.getRange(userRow, 4).setValue(newPasswordHash);

  return {
    success: true,
    message: 'Password berhasil diubah.'
  };
}

/**
 * RESET password (admin reset user password)
 */
function serverResetPassword(token, userId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (user.role !== 'admin_ppg') {
    return { success: false, error: 'Hanya admin PPG yang dapat reset password.' };
  }

  const usersData = readSheetAsObjects(SHEET_NAMES.USERS);
  const targetUserIndex = usersData.findIndex(u => u.id == userId);

  if (targetUserIndex === -1) return { success: false, error: 'User tidak ditemukan.' };

  // Generate new temporary password
  const tempPassword = generateTemporaryPassword();
  const passwordHash = hashPassword(tempPassword);

  const usersSheet = getSheetByName(SHEET_NAMES.USERS);
  const userRow = targetUserIndex + 2;
  usersSheet.getRange(userRow, 4).setValue(passwordHash);

  return {
    success: true,
    message: `Password berhasil direset. Password sementara: ${tempPassword}`,
    tempPassword
  };
}

/**
 * UTILITY: Generate temporary password (8 chars random alphanumeric)
 */
function generateTemporaryPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * UTILITY: Hash password using SHA-256
 */
function hashPassword(password) {
  const hashedPassword = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  return hashedPassword.map((b) => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

/**
 * UTILITY: Toggle user status (active/inactive)
 */
function serverToggleUserStatus(token, userId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (user.role !== 'admin_ppg') {
    return { success: false, error: 'Hanya admin PPG yang dapat mengubah status user.' };
  }

  const usersData = readSheetAsObjects(SHEET_NAMES.USERS);
  const targetUserIndex = usersData.findIndex(u => u.id == userId);

  if (targetUserIndex === -1) return { success: false, error: 'User tidak ditemukan.' };

  const targetUser = usersData[targetUserIndex];
  const newStatus = targetUser.status === 'active' ? 'inactive' : 'active';

  const usersSheet = getSheetByName(SHEET_NAMES.USERS);
  const userRow = targetUserIndex + 2;
  usersSheet.getRange(userRow, 9).setValue(newStatus);

  return {
    success: true,
    message: `Status user berhasil diubah menjadi ${newStatus}.`,
    newStatus
  };
}
