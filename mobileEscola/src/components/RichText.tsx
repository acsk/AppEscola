import React from 'react';
import { Text, type TextProps } from 'react-native';
import { parseRichText } from '../lib/richText';

type Props = Omit<TextProps, 'children'> & { value: string | null | undefined };

/** Texto de questão com negrito/itálico/sublinhado (Text aninhado, nunca HTML). Herda o estilo do Text pai. */
export default function RichText({ value, ...props }: Props) {
  return (
    <Text {...props}>
      {parseRichText(value).map((s, i) =>
        s.b || s.i || s.u ? (
          <Text
            key={i}
            style={{
              fontWeight: s.b ? '700' : undefined,
              fontStyle: s.i ? 'italic' : undefined,
              textDecorationLine: s.u ? 'underline' : undefined,
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
