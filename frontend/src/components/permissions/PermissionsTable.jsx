import React, { useMemo } from "react";

const stripActionSuffix = (label) => {
  const raw = String(label || "");
  return raw.replace(/\s*(?:-|\u2013)\s*(View|Edit)\s*$/i, "");
};

const renderPermMark = (enabled) => (
  <span className={`perm-mark ${enabled ? "is-yes" : "is-no"}`}>
    {enabled ? (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="perm-mark-icon">
        <path d="M5 13l4 4L19 7" />
      </svg>
    ) : (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="perm-mark-icon">
        <path d="M6 6l12 12M18 6l-12 12" />
      </svg>
    )}
  </span>
);

export default function PermissionsTable({
  permissionsGrouped = {},
  permissionSelections = {},
  permissionScopes = {},
  userSchools = [],
  isAdmin = false,
  onTogglePermission,
  onToggleGroup,
  onScopeChange,
}) {
  const permissionRowsByGroup = useMemo(() => {
    const out = {};
    Object.entries(permissionsGrouped || {}).forEach(([groupName, perms]) => {
      const map = new Map();
      perms.forEach((perm) => {
        if (!isAdmin && perm.resource === "page.manage_permissions") return;
        const resource = String(perm.resource || "");
        if (!resource) return;
        if (!map.has(resource)) {
          map.set(resource, {
            resource,
            label: stripActionSuffix(perm.label || resource),
            readKey: `${resource}|read`,
            writeKey: `${resource}|write`,
          });
        }
      });
      const rows = Array.from(map.values());
      rows.sort((a, b) => a.label.localeCompare(b.label, "tr", { sensitivity: "base" }));
      out[groupName] = rows;
    });
    return out;
  }, [permissionsGrouped, isAdmin]);

  if (!permissionsGrouped || Object.keys(permissionsGrouped).length === 0) {
    return <div>No permissions defined.</div>;
  }

  return (
    <>
      {Object.entries(permissionsGrouped).map(([grp, perms]) => {
        const rows = permissionRowsByGroup[grp] || [];
        if (rows.length === 0) return null;
        const groupKeys = perms
          .filter((perm) => (isAdmin ? true : perm.resource !== "page.manage_permissions"))
          .map((perm) => `${perm.resource}|${perm.action}`);
        const selectedCount = groupKeys.filter((k) => permissionSelections[k]).length;
        const allSelected = groupKeys.length > 0 && selectedCount === groupKeys.length;
        const indeterminate = selectedCount > 0 && !allSelected;
        return (
          <div key={grp} style={{ marginBottom: 12 }}>
            <div className="row" style={{ alignItems: "center", marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = indeterminate;
                }}
                onChange={() => onToggleGroup?.(groupKeys, !allSelected)}
              />
              <div style={{ fontWeight: 600 }}>{grp}</div>
            </div>
            <table className="table permissions-table">
              <thead>
                <tr>
                  <th>Resource</th>
                  <th style={{ textAlign: "center" }}>Read</th>
                  <th style={{ textAlign: "center" }}>Write</th>
                  <th>Scope</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const readSelected = Boolean(permissionSelections[row.readKey]);
                  const writeSelected = Boolean(permissionSelections[row.writeKey]);
                  const scopeVal =
                    permissionScopes[row.writeKey] || permissionScopes[row.readKey] || "country";
                  const scopeDisabled = !readSelected && !writeSelected;
                  return (
                    <tr key={row.resource}>
                      <td>{row.resource}</td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          className={`perm-toggle ${readSelected ? "is-yes" : "is-no"}`}
                          onClick={() => onTogglePermission?.(row.readKey, scopeVal)}
                          aria-pressed={readSelected}
                          title="Read"
                        >
                          {renderPermMark(readSelected)}
                        </button>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          className={`perm-toggle ${writeSelected ? "is-yes" : "is-no"}`}
                          onClick={() => onTogglePermission?.(row.writeKey, scopeVal)}
                          aria-pressed={writeSelected}
                          title="Write"
                        >
                          {renderPermMark(writeSelected)}
                        </button>
                      </td>
                      <td>
                        <select
                          className="input sm"
                          disabled={scopeDisabled}
                          value={scopeVal}
                          onChange={(e) => onScopeChange?.(row.resource, e.target.value)}
                        >
                          <option value="country">{isAdmin ? "User Country" : "Country"}</option>
                          {userSchools &&
                            userSchools.map((s) => (
                              <option key={s.id} value={`school:${s.id}`}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}
