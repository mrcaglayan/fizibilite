// backend/src/utils/permissionsCatalog.js

/**
 * Permission catalog for the application.
 *
 * To support more granular control, each resource is defined once in the
 * base catalog below and then expanded into individual permission entries
 * for each action (e.g., read, write).  The action determines what
 * operation the permission grants.  A `write` permission implicitly
 * allows `read` access as well, but a `read` permission does not allow
 * writes.
 *
 * The `label` for each generated entry appends a human‑friendly suffix
 * indicating the action (e.g., "Temel Bilgiler – Read", "Temel Bilgiler – Write").
 * If you add new resources here, be sure to specify a group name for
 * grouping in the UI.
 */

// Base definitions for resources (without action).  Each entry should
// include: resource (string), label (string), and group (string).  The
// `label` describes the resource itself without referencing the action.
const BASE_RESOURCES = [
  // Page‑level resources
  { resource: "page.temel_bilgiler", label: "Temel Bilgiler", group: "Temel Bilgiler" },
  { resource: "page.kapasite", label: "Kapasite", group: "Kapasite" },
  { resource: "page.grades_plan", label: "Sınıf/Sube Planı", group: "Sınıf/Sube Planı" },
  { resource: "page.norm", label: "Norm", group: "Norm" },
  { resource: "page.ik", label: "IK / HR", group: "IK / HR" },
  { resource: "page.gelirler", label: "Gelirler", group: "Gelirler" },
  { resource: "page.giderler", label: "Giderler", group: "Giderler" },
  // Renamed from "indirimler" to "discounts" to normalize the permission namespace.
  { resource: "page.discounts", label: "İndirimler", group: "İndirimler" },

  // New top‑level pages added for dashboard and reports.  The group values control
  // how permissions are grouped in the UI.  Each page entry will be expanded
  // into read/write permissions later in this file.
  { resource: "page.dashboard", label: "Dashboard", group: "Dashboard" },
  { resource: "page.detayli_rapor", label: "Detaylı Rapor", group: "Raporlar" },
  { resource: "page.rapor", label: "Rapor", group: "Raporlar" },

  // Section‑level resources for Temel Bilgiler
  { resource: "section.temel_bilgiler.okul_egitim", label: "Okul Eğitim Bilgileri", group: "Temel Bilgiler" },
  { resource: "section.temel_bilgiler.inflation", label: "Enflasyon ve Parametreler", group: "Temel Bilgiler" },
  { resource: "section.temel_bilgiler.ik_mevcut", label: "IK Mevcut", group: "Temel Bilgiler" },
  { resource: "section.temel_bilgiler.burs_ogr", label: "Burs ve İndirimler (Öğrenci)", group: "Temel Bilgiler" },
  { resource: "section.temel_bilgiler.rakip", label: "Rakip Analizi", group: "Temel Bilgiler" },
  { resource: "section.temel_bilgiler.performans", label: "Performans (Önceki Dönem)", group: "Temel Bilgiler" },

  // Section‑level resources for Kapasite
  { resource: "section.kapasite.caps", label: "Kapasite", group: "Kapasite" },

  // Section‑level resources for Grades Plan
  { resource: "section.grades_plan.plan", label: "Planlanan Sınıf/Sube", group: "Sınıf/Sube Planı" },

  // Section‑level resources for Norm
  { resource: "section.norm.ders_dagilimi", label: "Ders Dağılımı", group: "Norm" },

  // Section‑level resources for IK / HR
  { resource: "section.ik.local_staff", label: "IK Yerel", group: "IK / HR" },

  // Section‑level resources for Gelirler
  { resource: "section.gelirler.unit_fee", label: "Birim Ücret", group: "Gelirler" },

  // Section‑level resources for Giderler
  { resource: "section.giderler.isletme", label: "İşletme Giderleri", group: "Giderler" },

  // Section‑level resources for İndirimler/Discounts.  The section key now lives
  // under the discounts page namespace.  Clients should use
  // `section.discounts.discounts` when checking permissions on discount data.
  { resource: "section.discounts.discounts", label: "İndirimler", group: "İndirimler" },

  // Scenario action permissions
  { resource: "scenario.create", label: "Yeni Senaryo", group: "Senaryo Islemleri" },
  { resource: "scenario.plan_edit", label: "Planlamayi Duzenle", group: "Senaryo Islemleri" },
  { resource: "scenario.copy", label: "Senaryo Kopyala", group: "Senaryo Islemleri" },
  { resource: "scenario.expense_split", label: "Gider Paylaştır", group: "Senaryo Islemleri" },
  { resource: "scenario.submit", label: "Onaya Gonder", group: "Senaryo Islemleri" },
  { resource: "scenario.delete", label: "Senaryo Sil", group: "Senaryo Islemleri" },

  // Management page for managing permissions (shown to users with the manage_permissions permission)
  { resource: "page.manage_permissions", label: "Manage Permissions", group: "Management" },

  // User and school management actions
  { resource: "user.create", label: "Kullanıcı Oluştur", group: "Kullanıcı Yönetimi" },
  { resource: "school.create", label: "Okul Oluştur", group: "Okul Yönetimi" },
];

// Define the actions that can be granted.  The order here controls
// ordering of permissions in the UI.  Each entry includes a key and
// a suffix to append to the base label to form the final label.
const ACTIONS = [
  { action: "read", labelSuffix: "– View" },
  { action: "write", labelSuffix: "– Edit" },
];

// Expand the base resources into specific permission entries for each action
const PERMISSIONS_CATALOG = BASE_RESOURCES.flatMap((base) => {
  return ACTIONS.map(({ action, labelSuffix }) => {
    return {
      resource: base.resource,
      action,
      label: `${base.label} ${labelSuffix}`,
      group: base.group,
    };
  });
});

module.exports = { PERMISSIONS_CATALOG };
