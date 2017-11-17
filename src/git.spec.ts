// tslint:disable:no-unused-expression
import * as chai from 'chai'
import * as mocha from 'mocha'
import { parseCommand } from './git'

const expect = chai.expect

describe('parseCommand', () => {
  it('should parse \\ correctly', () => {
    const result = parseCommand(
      'clone -b master -- git@tp.githost.io:staging/configs.git tmp\\git\\read'
    )
    expect(result.length).to.be.equals(6)
    expect(result[5]).to.be.equals('tmp\\git\\read')
  })
})
