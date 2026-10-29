import * as React from 'react'

// Split out of sidebar.tsx: a file that exports both React components and a
// hook/context breaks Vite Fast Refresh ("export is incompatible") because
// the module can no longer be hot-swapped as a pure component module.
export type SidebarContextProps = {
	state: 'expanded' | 'collapsed'
	open: boolean
	setOpen: (open: boolean) => void
	openMobile: boolean
	setOpenMobile: (open: boolean) => void
	isMobile: boolean
	toggleSidebar: () => void
}

export const SidebarContext = React.createContext<SidebarContextProps | null>(
	null
)

export function useSidebar() {
	const context = React.useContext(SidebarContext)
	if (!context) {
		throw new Error('useSidebar must be used within a SidebarProvider.')
	}

	return context
}
