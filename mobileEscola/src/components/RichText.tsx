import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { parseRichText } from '../lib/richText';

type Props = Omit<TextProps, 'children'> & { value: string | null | undefined };

const locked: TextStyle = { userSelect: 'none' };

/** Texto de questão com negrito/itálico/sublinhado (Text aninhado, nunca HTML). Herda o estilo do Text pai. Não pode ser selecionado nem copiado. */
export default function RichText({ value, style, ...props }: Props) {
  return (
    <Text {...props} selectable={false} style={[style, locked]}>
      {parseRichText(value).map((s, i) =>
        s.b || s.i || s.u ? (
          <Text
            key={i}
            selectable={false}
            style={{
              fontWeight: s.b ? '700' : undefined,
              fontStyle: s.i ? 'italic' : undefined,
              textDecorationLine: s.u ? 'underline' : undefined,
              userSelect: 'none',
            }}
          >
            {s.text}
          </Text>
        ) : (
          s.text
        ),
      )}
    </Text>
  );
}
