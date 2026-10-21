import { useMemo } from 'react'
import { ScrollView, Text, View } from 'react-native'

//Config
import { useThemedStyles } from '@/config/theme'

//Components
import { Inlines } from './inline'

//Helpers
import { getColumnWidths } from './helpers'

//Styles
import { makeStyles } from './styles'

//Type
import type { TableCellProps, TableProps, TableRowProps } from './types'

const TableCell = (props: TableCellProps) => {
  const styles = useThemedStyles(makeStyles)
  const width = props.width

  const size = useMemo(() => ({ width }), [width])

  return (
    <View style={[styles.tableCell, size]}>
      <Text style={[props.header ? styles.cellHeader : styles.cellText, styles[props.align]]}>
        <Inlines nodes={props.nodes} />
      </Text>
    </View>
  )
}

const TableRow = (props: TableRowProps) => {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={[styles.tableRow, props.header && styles.tableHeader]}>
      {props.cells.map((nodes, column) => (
        <TableCell
          // A row's cells never reorder, and a cell has no identity but its column.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above.
          key={column}
          nodes={nodes}
          width={props.widths[column] ?? 0}
          align={props.align[column] ?? 'left'}
          header={props.header}
        />
      ))}
    </View>
  )
}

/**
 * A table. Columns are as wide as their content wants (within limits) and the whole table scrolls
 * sideways, which reads better on a narrow screen than squeezing every column in.
 */
export const Table = (props: TableProps) => {
  const styles = useThemedStyles(makeStyles)
  const table = props.table

  const widths = useMemo(() => getColumnWidths(table), [table])

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.table}>
        <TableRow header cells={table.header} widths={widths} align={table.align} />
        {table.rows.map((cells, line) => (
          <TableRow
            // Rows never reorder, and a row has no identity but its place.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above.
            key={line}
            header={false}
            cells={cells}
            widths={widths}
            align={table.align}
          />
        ))}
      </View>
    </ScrollView>
  )
}
