import React from 'react';
import { View } from 'react-native';
import { Txt, font, radius, space, usePalette } from '../../../ui';

type Props = {
  /** Só o quadrado com "R" (barra de ferramentas do desktop). */
  iconOnly?: boolean;
};

/** Selo "R · Revisada": o professor revisou o aviso de erro e a questão não pode ser informada de novo. */
export function ReviewedBadge({ iconOnly }: Props) {
  const p = usePalette();
  const label = 'Revisada pelo professor';
  const icon = (
    <View style={{
      width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center',
      backgroundColor: p.successSoft, borderWidth: 1, borderColor: p.success,
    }}>
      <Txt style={{ color: p.success, fontSize: 17, lineHeight: 20, ...font.extrabold }}>R</Txt>
    </View>
  );

  return (
    <View accessible accessibilityRole="text" accessibilityLabel={label} {...({ title: label } as object)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], alignSelf: iconOnly ? undefined : 'flex-start' }}>
      {icon}
      {iconOnly ? null : <Txt variant="label" style={{ color: p.success }}>Revisada</Txt>}
    </View>
  );
}
