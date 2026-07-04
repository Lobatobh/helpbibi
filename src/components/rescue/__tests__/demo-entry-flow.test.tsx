import { describe, expect, test } from 'bun:test'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ClientEntryForm,
  ProviderEntryForm,
} from '@/components/rescue/demo-entry-form'

function childrenOf(node: ReactElement): ReactNode[] {
  const children = node.props?.children
  return Array.isArray(children) ? children : [children]
}

function walk(node: ReactNode, visit: (element: ReactElement) => void) {
  if (!isValidElement(node)) return
  visit(node)
  for (const child of childrenOf(node)) walk(child, visit)
}

function textContent(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (!isValidElement(node)) return ''
  return childrenOf(node).map(textContent).join('')
}

function renderedMarkup(node: ReactNode): string {
  return renderToStaticMarkup(node as ReactElement)
}

function renderedText(node: ReactNode): string {
  return renderedMarkup(node).replace(/<[^>]+>/g, '')
}

function findClickableByText(root: ReactNode, text: string): ReactElement {
  let match: ReactElement | null = null
  walk(root, (element) => {
    if (!match && typeof element.props?.onClick === 'function' && textContent(element).includes(text)) {
      match = element
    }
  })
  if (!match) throw new Error(`Could not find element containing text: ${text}`)
  return match
}

describe('public demo client entry', () => {
  test('calls the register handler when name is valid and socket is connected', () => {
    let calls = 0
    const form = ClientEntryForm({
      name: 'Ana Cliente',
      connected: true,
      connectionError: null,
      onNameChange: () => {},
      onRegister: () => { calls += 1 },
    })

    const button = findClickableByText(form, 'Entrar como cliente')
    expect(button.props.disabled).toBe(false)
    button.props.onClick()
    expect(calls).toBe(1)
  })

  test('changes the connecting text when socket connects', () => {
    const form = ClientEntryForm({
      name: 'Ana Cliente',
      connected: true,
      connectionError: null,
      onNameChange: () => {},
      onRegister: () => {},
    })

    expect(renderedText(form)).toContain('Conectado ao serviço')
    expect(renderedText(form)).not.toContain('Conectando...')
  })

  test('shows a visible socket error when connection fails', () => {
    const form = ClientEntryForm({
      name: 'Ana Cliente',
      connected: false,
      connectionError: 'Falha na conexão em tempo real. Recarregue a página ou tente novamente em alguns segundos.',
      onNameChange: () => {},
      onRegister: () => {},
    })

    expect(renderedMarkup(form)).toContain('role="alert"')
    expect(renderedText(form)).toContain('Falha na conexão em tempo real')
  })
})

describe('public demo provider entry', () => {
  test('calls the register handler when provider fields are valid and socket is connected', () => {
    let calls = 0
    const form = ProviderEntryForm({
      name: 'Prestador Teste',
      vehicle: 'Guincho Plataforma',
      plate: 'ABC1D23',
      connected: true,
      connectionError: null,
      onNameChange: () => {},
      onVehicleChange: () => {},
      onPlateChange: () => {},
      onRegister: () => { calls += 1 },
    })

    const button = findClickableByText(form, 'Entrar como prestador')
    expect(button.props.disabled).toBe(false)
    button.props.onClick()
    expect(calls).toBe(1)
  })

  test('shows a visible socket error when connection fails', () => {
    const form = ProviderEntryForm({
      name: 'Prestador Teste',
      vehicle: 'Guincho Plataforma',
      plate: 'ABC1D23',
      connected: false,
      connectionError: 'Falha na conexão em tempo real. Recarregue a página ou tente novamente em alguns segundos.',
      onNameChange: () => {},
      onVehicleChange: () => {},
      onPlateChange: () => {},
      onRegister: () => {},
    })

    expect(renderedMarkup(form)).toContain('role="alert"')
    expect(renderedText(form)).toContain('Falha na conexão em tempo real')
  })
})
